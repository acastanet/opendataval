from __future__ import annotations

from argparse import ArgumentParser, Namespace
from pathlib import Path
from typing import TYPE_CHECKING
import sys

from .config import PocConfig, latest_run
from .glb import create_scene_glb
from .native import check_environment
from .validation import validate_run
from .web import prepare_viewer, serve_viewer

if TYPE_CHECKING:
    from .scene import ScenePlan


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
        ("vegetation", "Détecte les cimes de la classe LiDAR 5 et écrit trees.json."),
        ("sun", "Retrouve la position solaire de l'orthophotographie par ses ombres."),
        ("glb", "Assemble terrain, orthophoto et bâtiments dans scene.glb."),
        ("web", "Prépare le visualiseur web local et ses dépendances."),
        ("enhance", "Enrichit la dernière sortie Roofer : terrain, ortho, GLB et web."),
        ("all", "Alias de enhance pour une exécution Windows Python complète."),
    ):
        subparsers.add_parser(name, help=help_text)
    serve = subparsers.add_parser("serve", help="Démarre le visualiseur web local.")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--no-open", action="store_true", help="N'ouvre pas le navigateur.")

    # `scene` est la seule sous-commande à ignorer `--config` : elle en fabrique une.
    new_scene = subparsers.add_parser(
        "scene",
        help="Prépare une nouvelle emprise à partir d'un point WGS84 et d'un côté en mètres.",
    )
    new_scene.add_argument("--lat", type=float, required=True, help="Latitude du centre (WGS84).")
    new_scene.add_argument("--lon", type=float, required=True, help="Longitude du centre (WGS84).")
    new_scene.add_argument(
        "--side", type=float, default=200.0, help="Côté de l'emprise carrée en mètres (défaut : 200)."
    )
    new_scene.add_argument("--title", required=True, help="Nom du lieu affiché par le visualiseur.")
    new_scene.add_argument(
        "--subtitle", default="IGN LiDAR HD", help="Surtitre de provenance affiché au-dessus du titre."
    )
    new_scene.add_argument("--id", dest="identifier", help="Identifiant, sinon dérivé du titre.")
    new_scene.add_argument(
        "--centre-label", default="Point central", help="Intitulé du point de vue centré."
    )
    new_scene.add_argument("--resolution", type=float, help="Maille du terrain en mètres.")
    new_scene.add_argument("--margin", type=float, default=15.0, help="Marge du terrain en mètres.")
    new_scene.add_argument("--ortho-px", type=int, help="Côté de l'orthophotographie en pixels.")
    new_scene.add_argument("--output-dir", help="Dossier des exécutions, sinon ./output-<id>.")
    new_scene.add_argument(
        "--write", action="store_true", help="Écrit la configuration au lieu d'afficher le plan."
    )
    new_scene.add_argument(
        "--overwrite", action="store_true", help="Remplace une configuration déjà présente."
    )
    new_scene.add_argument("--json", action="store_true", help="Rend le plan en JSON.")
    return result


def _enhance(config: PocConfig, run_dir: Path) -> None:
    from .enrichment import create_terrain, download_orthophoto
    from .vegetation import create_vegetation

    validate_run(config, run_dir)
    create_terrain(config, run_dir)
    if config.get_bool("VEGETATION", True):
        create_vegetation(config, run_dir)
    download_orthophoto(config, run_dir)
    create_scene_glb(config, run_dir)
    prepare_viewer(config, run_dir)


def _report_scene(plan: "ScenePlan") -> None:
    """Rend le plan lisible en console : c'est la même information que `--json`."""
    xmin, ymin, xmax, ymax = plan.bbox
    latitude, longitude = plan.centre_wgs84[1], plan.centre_wgs84[0]
    side = round(plan.request.side_m)
    print(f"Scène « {plan.request.title} » — {plan.identifier}")
    print(f"  Centre         : {latitude:.6f}, {longitude:.6f} (WGS84)")
    print(
        f"                   {plan.centre_lambert93[0]:.0f}, {plan.centre_lambert93[1]:.0f}"
        " (Lambert-93)"
    )
    print(f"  Emprise        : {side} × {side} m — POC_BBOX=\"{xmin:.0f} {ymin:.0f} {xmax:.0f} {ymax:.0f}\"")
    print(f"  Terrain        : {plan.terrain_side_m:g} m de côté à {plan.terrain_resolution_m:g} m")
    print(f"                   {plan.terrain_cells} mailles, scène estimée à {plan.estimated_glb_mb:.0f} Mo")
    print(f"  Orthophoto     : {plan.ortho_size_px} px, soit {plan.ortho_resolution_m * 100:.0f} cm/pixel")
    print(f"  Dalles LiDAR   : {', '.join(plan.tiles)}")
    print(f"  Sorties        : {plan.output_dir}")
    for warning in plan.warnings:
        print(f"  Attention      : {warning}")
    print("\nÉtape amont, en Git Bash, dalles mises en cache au préalable :")
    print(plan.upstream_command())


def _new_scene(args: Namespace) -> None:
    from .scene import SceneRequest, plan_scene, write_scene

    plan = plan_scene(
        SceneRequest(
            latitude=args.lat,
            longitude=args.lon,
            side_m=args.side,
            title=args.title,
            subtitle=args.subtitle,
            identifier=args.identifier,
            centre_label=args.centre_label,
            terrain_resolution_m=args.resolution,
            terrain_margin_m=args.margin,
            ortho_size_px=args.ortho_px,
            output_dir=args.output_dir,
        )
    )
    if args.json:
        import json

        print(json.dumps(plan.as_dict(), indent=2, ensure_ascii=False))
    else:
        _report_scene(plan)
    if not args.write:
        if not args.json:
            print("\nAucun fichier écrit. Ajouter --write pour créer la configuration.")
        return
    for path in write_scene(plan, ROOT, overwrite=args.overwrite):
        print(f"Écrit : {path.relative_to(ROOT).as_posix()}")


def execute(args: Namespace) -> None:
    if args.command == "scene":
        _new_scene(args)
        return
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
    elif args.command == "vegetation":
        from .vegetation import create_vegetation

        create_vegetation(config)
    elif args.command == "sun":
        from .sun import report_ortho_sun

        report_ortho_sun(config)
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
