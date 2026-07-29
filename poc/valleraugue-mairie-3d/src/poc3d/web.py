from __future__ import annotations

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
    "addons/objects/Sky.js": (
        f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/objects/Sky.js"
    ),
    # Chaîne de post-traitement de l'occlusion ambiante, active uniquement en rendu réaliste.
    **{
        f"addons/{relative}": (
            f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/{relative}"
        )
        for relative in (
            "postprocessing/EffectComposer.js",
            "postprocessing/Pass.js",
            "postprocessing/RenderPass.js",
            "postprocessing/ShaderPass.js",
            "postprocessing/MaskPass.js",
            "postprocessing/OutputPass.js",
            "postprocessing/GTAOPass.js",
            "shaders/CopyShader.js",
            "shaders/OutputShader.js",
            "shaders/GTAOShader.js",
            "shaders/PoissonDenoiseShader.js",
            "math/SimplexNoise.js",
        )
    },
}


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
    handler = partial(SimpleHTTPRequestHandler, directory=str(web_dir))
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
