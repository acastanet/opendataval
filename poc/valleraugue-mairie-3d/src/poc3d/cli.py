from __future__ import annotations

from argparse import ArgumentParser, Namespace
from pathlib import Path
import sys

from .config import PocConfig, latest_run
from .glb import create_scene_glb
from .native import check_environment
from .validation import validate_run
from .web import prepare_viewer, serve_viewer


ROOT = Path(__file__).resolve().parents[2]


def parser() -> ArgumentParser:
    result = ArgumentParser(
        description="POC Python : bâtiments, terrain, orthophoto, GLB et visualiseur local."
    )
    result.add_argument(
        "--config",
        default="config/poc-200m.conf",
        help="Fichier de configuration (défaut : config/poc-200m.conf)",
    )
    subparsers = result.add_subparsers(dest="command", required=True)
    for name, help_text in (
        ("check", "Vérifie Python, les dépendances et les données d'entrée."),
        ("validate", "Valide la dernière exécution."),
        ("terrain", "Génère un MNT à partir des points LiDAR de classe sol."),
        ("ortho", "Télécharge l'orthophotographie IGN sur l'emprise."),
        ("glb", "Assemble terrain, orthophoto et bâtiments dans scene.glb."),
        ("web", "Prépare le visualiseur web local et ses dépendances."),
        ("enhance", "Enrichit la dernière sortie Roofer : terrain, ortho, GLB et web."),
        ("all", "Alias de enhance pour une exécution Windows Python complète."),
    ):
        subparsers.add_parser(name, help=help_text)
    serve = subparsers.add_parser("serve", help="Démarre le visualiseur web local.")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--no-open", action="store_true", help="N'ouvre pas le navigateur.")
    return result


def _enhance(config: PocConfig, run_dir: Path) -> None:
    from .enrichment import create_terrain, download_orthophoto

    validate_run(config, run_dir)
    create_terrain(config, run_dir)
    download_orthophoto(config, run_dir)
    create_scene_glb(config, run_dir)
    prepare_viewer(config, run_dir)


def execute(args: Namespace) -> None:
    config = PocConfig.load(ROOT, args.config)
    if args.command == "check":
        check_environment(config)
    elif args.command == "validate":
        validate_run(config)
    elif args.command == "terrain":
        from .enrichment import create_terrain

        create_terrain(config)
    elif args.command == "ortho":
        from .enrichment import download_orthophoto

        download_orthophoto(config)
    elif args.command == "glb":
        create_scene_glb(config)
    elif args.command == "web":
        prepare_viewer(config)
    elif args.command == "enhance":
        _enhance(config, latest_run(config, require_complete=True))
    elif args.command == "all":
        run_dir = check_environment(config)
        _enhance(config, run_dir)
    elif args.command == "serve":
        serve_viewer(
            config,
            port=args.port,
            open_browser=not args.no_open,
        )
    else:
        raise ValueError(f"Commande inconnue : {args.command}")


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        execute(args)
    except KeyboardInterrupt:
        print("\nInterruption demandée.", file=sys.stderr)
        return 130
    except (OSError, RuntimeError, ValueError) as error:
        print(f"ERREUR : {error}", file=sys.stderr)
        return 1
    return 0
