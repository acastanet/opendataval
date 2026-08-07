from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import gzip
import json
import os
import shutil

from .config import PocConfig, latest_run
from .web import prepare_viewer, viewer_is_stale


# Types dont la version compressée vaut la peine d'être précalculée et servie par
# `precompressed` (cf. docs/publication-visualiseur.md § 3). `-6`, pas `-9` : plus rapide et,
# sur ces GLB en float32, plus petit — la recherche de correspondances agressive de `-9` tombe
# moins bien sur de la géométrie qu'un flux répétitif de pixels.
COMPRESSIBLE_SUFFIXES = {".glb", ".js", ".css", ".html", ".json", ".png", ".svg"}
GZIP_LEVEL = 6


def check_manifest(web_dir: Path) -> list[str]:
    """Défauts qui interdisent la publication, ou liste vide si le dossier est sain.

    Automatise les contrôles du § 2 de la doc de publication. Le `title` d'une scène peut
    légitimement manquer (une exécution préparée avant `SCENE_TITLE`) : le visualiseur retombe
    alors sur une identité par défaut. Ce qui ne peut pas manquer, c'est le `label` — c'est le
    seul texte que le sélecteur affiche, et deux entrées portant le même rendraient un choix
    impossible à distinguer.
    """
    manifest_path = web_dir / "assets" / "scenes.json"
    if not manifest_path.is_file():
        return ["assets/scenes.json est absent"]
    try:
        entries = json.loads(manifest_path.read_text(encoding="utf-8"))
    except ValueError as error:
        return [f"assets/scenes.json est illisible : {error}"]
    if not entries:
        return ["assets/scenes.json ne référence aucune scène"]

    problems: list[str] = []
    labels: list[str] = []
    for entry in entries:
        identifier = entry.get("id", "?")
        for key in ("scene", "metadata"):
            relative = entry.get(key)
            if not relative or not (web_dir / relative).is_file():
                problems.append(f"{identifier} : {key} référencé mais absent ({relative})")
        geology = entry.get("configuration", {}).get("geology")
        if geology:
            for geology_key, relative in geology.items():
                if not (web_dir / relative).is_file():
                    problems.append(
                        f"{identifier} : geology.{geology_key} référencé mais absent ({relative})"
                    )
        label = str(entry.get("label", "")).strip()
        if not label:
            problems.append(f"{identifier} : label absent du sélecteur")
        else:
            labels.append(label)

    duplicates = sorted({label for label in labels if labels.count(label) > 1})
    if duplicates:
        problems.append(
            "labels du sélecteur dupliqués (deux scènes y seraient indiscernables) : "
            + ", ".join(duplicates)
        )
    return problems


def _needs_copy(source: Path, destination: Path) -> bool:
    if not destination.is_file():
        return True
    current, previous = source.stat(), destination.stat()
    return current.st_size != previous.st_size or current.st_mtime > previous.st_mtime


def _write_priority(relative: str) -> tuple[int, str]:
    """Ordre d'écriture : les données d'abord, le manifeste qui les référence ensuite, puis
    l'interface qui les lit toutes deux en dernier. Un visiteur qui tombe en pleine
    synchronisation voit au pire une nouvelle scène pas encore listée, jamais un manifeste qui
    pointe sur un fichier pas encore arrivé."""
    if relative == "assets/scenes.json":
        return (1, relative)
    if relative == "viewer-manifest.json":
        return (2, relative)
    if relative.startswith("assets/") or relative.startswith("vendor/"):
        return (0, relative)
    return (3, relative)


def sync_tree(source: Path, target: Path) -> tuple[list[str], list[str], int]:
    """Synchronise ``target`` sur ``source`` sans repartir d'un dossier vide.

    Copie ce qui a changé, supprime ce qui n'a plus de source — y compris les `.gz` orphelins
    d'un fichier supprimé — et rend ce qui a bougé pour le rapport de publication.
    """
    target.mkdir(parents=True, exist_ok=True)
    source_files = {
        path.relative_to(source).as_posix() for path in source.rglob("*") if path.is_file()
    }

    copied: list[str] = []
    unchanged = 0
    for relative in sorted(source_files, key=_write_priority):
        src = source / relative
        dst = target / relative
        if _needs_copy(src, dst):
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied.append(relative)
        else:
            unchanged += 1

    removed: list[str] = []
    for path in sorted(target.rglob("*"), reverse=True):
        if not path.is_file():
            continue
        relative = path.relative_to(target).as_posix()
        base = relative[:-3] if relative.endswith(".gz") else relative
        if base not in source_files:
            path.unlink()
            removed.append(relative)
    for path in sorted(target.rglob("*"), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()

    return copied, removed, unchanged


def _compress_one(path: Path) -> bool:
    gz_path = path.with_name(path.name + ".gz")
    mtime = path.stat().st_mtime
    if gz_path.is_file() and gz_path.stat().st_mtime >= mtime:
        return False
    tmp_path = gz_path.with_name(gz_path.name + ".tmp")
    # `mtime=0` rend le flux compressé reproductible ; l'horodatage réel est reporté ensuite
    # sur le fichier, pour que la comparaison ci-dessus reste juste au prochain passage.
    with open(tmp_path, "wb") as raw, gzip.GzipFile(
        filename="", mode="wb", fileobj=raw, compresslevel=GZIP_LEVEL, mtime=0
    ) as gz_file, open(path, "rb") as source_file:
        shutil.copyfileobj(source_file, gz_file)
    os.replace(tmp_path, gz_path)
    os.utime(gz_path, (mtime, mtime))
    return True


def compress_tree(target: Path, *, jobs: int | None = None) -> int:
    """Précompresse en `.gz` tout ce qui en vaut la peine, en ne refaisant que ce qui a bougé."""
    candidates = [
        path
        for path in target.rglob("*")
        if path.is_file() and path.suffix.lower() in COMPRESSIBLE_SUFFIXES
    ]
    if not candidates:
        return 0
    with ThreadPoolExecutor(max_workers=jobs or os.cpu_count() or 4) as pool:
        results = list(pool.map(_compress_one, candidates))
    return sum(results)


def publish_viewer(
    config: PocConfig,
    *,
    run_dir: Path | None = None,
    regenerate: bool = True,
    destination: Path | None = None,
    jobs: int | None = None,
) -> Path:
    """Régénère, contrôle et publie le visualiseur en une seule commande.

    Remplace la procédure manuelle du § 2 et § 3 de docs/publication-visualiseur.md : un
    `web/` périmé, un manifeste incohérent ou des labels dupliqués interrompent la publication
    au lieu de partir en ligne silencieusement.
    """
    if regenerate:
        web_dir = prepare_viewer(config, run_dir)
    else:
        web_dir = (run_dir or latest_run(config, require_complete=True)) / "web"
        if not (web_dir / "index.html").is_file():
            raise FileNotFoundError("Aucun visualiseur préparé : exécuter `poc.py web` d'abord")

    stale = viewer_is_stale(config, web_dir)
    if stale:
        raise RuntimeError(
            f"Visualiseur périmé ({', '.join(stale)}) : exécuter `poc.py web` avant de publier."
        )

    problems = check_manifest(web_dir)
    if problems:
        raise RuntimeError("Publication refusée :\n" + "\n".join(f"  - {p}" for p in problems))

    target = destination or (config.root / "publication")
    copied, removed, unchanged = sync_tree(web_dir, target)
    compressed = compress_tree(target, jobs=jobs)

    total_bytes = sum(
        path.stat().st_size
        for path in target.rglob("*")
        if path.is_file() and not path.name.endswith(".gz")
    )
    total_with_gz = sum(path.stat().st_size for path in target.rglob("*") if path.is_file())
    scenes = json.loads((target / "assets" / "scenes.json").read_text(encoding="utf-8"))

    print(f"Publication : {target}")
    print(
        f"  Scènes ({len(scenes)}) : "
        + ", ".join(f"{entry['label']} ({entry['run']})" for entry in scenes)
    )
    print(
        f"  Synchronisation : {len(copied)} copié(s), {len(removed)} supprimé(s), "
        f"{unchanged} inchangé(s)"
    )
    print(f"  Précompression : {compressed} fichier(s) (re)compressé(s)")
    print(
        f"  Volume : {total_bytes / 1_048_576:.1f} Mio hors .gz, "
        f"{total_with_gz / 1_048_576:.1f} Mio sur disque"
    )
    return target
