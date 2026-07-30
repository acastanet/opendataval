from __future__ import annotations

from dataclasses import dataclass
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import shutil
import urllib.request
import webbrowser

from .config import PocConfig, latest_run


THREE_VERSION = "0.178.0"
VENDOR_FILES = {
    "three.module.js": f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/build/three.module.js",
    "three.core.js": f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/build/three.core.js",
    "addons/controls/OrbitControls.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/controls/OrbitControls.js"
    ),
    "addons/loaders/GLTFLoader.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js"
    ),
    "addons/utils/BufferGeometryUtils.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/utils/BufferGeometryUtils.js"
    ),
    "addons/environments/RoomEnvironment.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/environments/RoomEnvironment.js"
    ),
    "addons/csm/CSM.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/csm/CSM.js"
    ),
    "addons/csm/CSMFrustum.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/csm/CSMFrustum.js"
    ),
    "addons/csm/CSMShader.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/csm/CSMShader.js"
    ),
}


# Sous-dossier des scènes autres que celle de l'exécution préparée. Cette dernière reste en
# `assets/scene.glb` : c'est le chemin documenté, et le sélecteur n'a pas à le déplacer.
ALTERNATE_SCENES_DIR = "scenes"
SCENE_FILES = ("scene.glb", "scene.json", "buildings.json")


class ViewerRequestHandler(SimpleHTTPRequestHandler):
    """Empêche le navigateur de mélanger deux versions de l'interface.

    Les scènes et les dépendances Three.js restent en cache : seuls les trois petits fichiers
    recopiés à chaque `poc.py web` doivent toujours être relus.
    """

    def end_headers(self) -> None:
        path = self.path.partition("?")[0]
        if path in ("/", "/index.html", "/app.js", "/styles.css"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


@dataclass(frozen=True)
class SceneEntry:
    """Une scène proposable au sélecteur du visualiseur."""

    identifier: str
    label: str
    run: str
    render_dir: Path
    prefix: str
    configuration: dict[str, object]
    title: str = ""
    subtitle: str = ""
    centre_label: str = ""

    def as_manifest(self) -> dict[str, object]:
        manifest: dict[str, object] = {
            "id": self.identifier,
            "label": self.label,
            "run": self.run,
            "scene": f"{self.prefix}/scene.glb",
            "metadata": f"{self.prefix}/scene.json",
            "configuration": self.configuration,
        }
        # Les scènes sans identité renseignée restent servies telles quelles : le visualiseur
        # garde ses textes par défaut plutôt que d'afficher une chaîne vide en titre.
        for key, value in (
            ("title", self.title),
            ("subtitle", self.subtitle),
            ("centreLabel", self.centre_label),
        ):
            if value:
                manifest[key] = value
        return manifest


def _scene_size(config: PocConfig) -> str:
    width, height = config.expected_size
    return f"{width:g} × {height:g} m"


def _scene_label(config: PocConfig) -> str:
    """Texte de l'option dans le sélecteur.

    La taille seule ne suffit plus dès que deux sites sont modélisés : « 200 × 200 m » ne
    dit pas lequel. Le titre passe donc devant, la taille reste derrière — c'est elle qui
    distingue deux emprises du même lieu.

    Derrière un titre, la taille est réduite à un seul côté : l'emprise est carrée par
    construction, et « Notre-Dame-de-la-Rouvière · 200 × 200 m » débordait de la largeur du
    panneau en tronquant précisément la partie qui distingue les emprises.
    """
    width, _ = config.expected_size
    title = config.scene_title
    return f"{title} · {width:g} m" if title else _scene_size(config)


def _scene_entry(config: PocConfig, identifier: str, run: str, render_dir: Path, prefix: str) -> SceneEntry:
    return SceneEntry(
        identifier=identifier,
        label=_scene_label(config),
        run=run,
        render_dir=render_dir,
        prefix=prefix,
        configuration=_viewer_configuration(config),
        title=config.scene_title,
        subtitle=config.scene_subtitle,
        centre_label=config.scene_centre_label,
    )


def _viewer_configuration(config: PocConfig) -> dict[str, object]:
    """Réglages documentaires dont le GLB historique ne garde pas toujours la trace."""
    xmin, ymin, xmax, ymax = config.terrain_bbox
    ortho_size = config.get_int("ORTHO_SIZE_PX", 1024)
    orthophoto_resolution = max(xmax - xmin, ymax - ymin) / ortho_size
    details: dict[str, object] = {
        "terrainBbox": [xmin, ymin, xmax, ymax],
        "orthophotoLayer": config.get("ORTHO_LAYER", "ORTHOIMAGERY.ORTHOPHOTOS"),
        "orthophotoSizePx": ortho_size,
        "orthophotoResolutionM": orthophoto_resolution,
    }
    orthophoto_date = config.get("ORTHO_DATE", "").strip()
    if orthophoto_date:
        details["orthophotoDate"] = orthophoto_date
    centre = config.scene_centre_wgs84
    if centre is not None:
        details["centreWgs84"] = list(centre)
    return details


def latest_scene_run(config: PocConfig) -> Path | None:
    """Exécution la plus récente portant une scène assemblée, ou ``None``.

    Le critère diffère de ``latest_run`` : une exécution Roofer complète peut très bien
    n'avoir jamais été enrichie, et le sélecteur ne doit proposer que ce qui se charge.
    """
    candidates = sorted(
        (
            path
            for path in config.output_dir.glob("run-*")
            if (path / "render" / "scene.glb").is_file()
            and (path / "render" / "scene.json").is_file()
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def available_scenes(config: PocConfig, run_dir: Path) -> list[SceneEntry]:
    """Scènes du sélecteur : l'exécution préparée d'abord, puis une par autre emprise.

    Les emprises se lisent dans les configurations versionnées de `config/`. Celle qui n'a
    encore aucune scène est simplement absente de la liste ; avec une seule scène, le
    sélecteur se masque.
    """
    entries = [
        _scene_entry(
            config,
            identifier=config.source.stem,
            run=run_dir.name,
            render_dir=run_dir / "render",
            prefix="assets",
        )
    ]
    seen = {(run_dir / "render").resolve()}
    # Les identifiants servent de valeurs au sélecteur : deux entrées homonymes rendraient un
    # choix ambigu, ce qui arrive dès qu'on prépare une exécution plus ancienne que la dernière.
    claimed = {entries[0].identifier}
    for source in sorted((config.root / "config").glob("*.conf")):
        try:
            other = PocConfig.load(config.root, source)
            other_run = latest_scene_run(other)
        except (OSError, ValueError):
            continue
        if other_run is None:
            continue
        render_dir = (other_run / "render").resolve()
        identifier = source.stem
        if render_dir in seen or identifier in claimed:
            continue
        seen.add(render_dir)
        claimed.add(identifier)
        entries.append(
            _scene_entry(
                other,
                identifier=identifier,
                run=other_run.name,
                render_dir=render_dir,
                prefix=f"assets/{ALTERNATE_SCENES_DIR}/{identifier}",
            )
        )
    return entries


def _copy_if_changed(source: Path, destination: Path) -> None:
    """Copie une scène volumineuse seulement si elle a bougé : `poc.py web` reste rapide."""
    if destination.is_file():
        current, previous = source.stat(), destination.stat()
        if current.st_size == previous.st_size and current.st_mtime <= previous.st_mtime:
            return
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def _download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url, headers={"User-Agent": "OpenDataVdA-POC/2.0"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def prepare_viewer(config: PocConfig, run_dir: Path | None = None) -> Path:
    run_dir = run_dir or latest_run(config, require_complete=True)
    render_dir = run_dir / "render"
    scene_glb = render_dir / "scene.glb"
    scene_json = render_dir / "scene.json"
    if not scene_glb.is_file() or not scene_json.is_file():
        raise FileNotFoundError("Exécuter d'abord la commande glb")

    viewer_source = config.root / "viewer"
    web_dir = run_dir / "web"
    assets_dir = web_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "app.js", "styles.css"):
        shutil.copy2(viewer_source / name, web_dir / name)
    shutil.copy2(scene_glb, assets_dir / "scene.glb")
    shutil.copy2(scene_json, assets_dir / "scene.json")
    # Table des attributs BD TOPO par nœud : absente des scènes générées avant son ajout.
    attributes = render_dir / "buildings.json"
    if attributes.is_file():
        shutil.copy2(attributes, assets_dir / "buildings.json")

    # Les autres emprises sont recopiées dans le dossier servi : le serveur local ne sert que
    # `web/`, il ne peut donc pas atteindre le `render/` d'une autre exécution.
    scenes = available_scenes(config, run_dir)
    for entry in scenes[1:]:
        for name in SCENE_FILES:
            source = entry.render_dir / name
            if source.is_file():
                _copy_if_changed(source, assets_dir / ALTERNATE_SCENES_DIR / entry.identifier / name)
    (assets_dir / "scenes.json").write_text(
        json.dumps([entry.as_manifest() for entry in scenes], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if len(scenes) > 1:
        others = ", ".join(entry.label for entry in scenes[1:])
        print(f"Scènes proposées au sélecteur : {scenes[0].label} (courante), {others}")

    vendor_dir = web_dir / "vendor"
    for relative, url in VENDOR_FILES.items():
        destination = vendor_dir / relative
        if not destination.is_file() or destination.stat().st_size == 0:
            print(f"Téléchargement dépendance web : {relative}")
            _download(url, destination)

    manifest = {
        "threeVersion": THREE_VERSION,
        "entrypoint": "index.html",
        "scene": "assets/scene.glb",
        "scenes": "assets/scenes.json",
        "localOnly": True,
    }
    (web_dir / "viewer-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Visualiseur préparé : {web_dir}")
    return web_dir


def serve_viewer(
    config: PocConfig,
    run_dir: Path | None = None,
    *,
    port: int = 8000,
    open_browser: bool = True,
) -> None:
    run_dir = run_dir or latest_run(config, require_complete=True)
    web_dir = run_dir / "web"
    if not (web_dir / "index.html").is_file():
        raise FileNotFoundError("Exécuter d'abord la commande web")
    handler = partial(ViewerRequestHandler, directory=str(web_dir))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Visualiseur disponible sur {url}")
    print("Arrêt : Ctrl+C")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du visualiseur.")
    finally:
        server.server_close()
