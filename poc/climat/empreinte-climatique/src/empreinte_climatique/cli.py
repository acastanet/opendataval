"""Interface en ligne de commande du dépôt autonome."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .build import build_from_raw_assets, write_delivery
from .fetch import download_climate_assets


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Produit l'empreinte climatique d'un lieu")
    commands = parser.add_subparsers(dest="command", required=True)

    build = commands.add_parser("build", help="télécharge les données et produit les livrables")
    build.add_argument("--lat", type=float, required=True, help="latitude WGS84")
    build.add_argument("--lon", type=float, required=True, help="longitude WGS84")
    build.add_argument("--tile-id", help="identifiant métier facultatif")
    build.add_argument("--output", type=Path, default=Path("output"))
    build.add_argument("--credentials", type=Path, help="chemin facultatif vers .cdsapirc")
    build.add_argument(
        "--reuse-raw",
        action="store_true",
        help="ne télécharge rien et réutilise output/raw",
    )

    render = commands.add_parser("render", help="réexporte les rendus depuis un JSON existant")
    render.add_argument("--input", type=Path, required=True)
    render.add_argument("--output", type=Path, default=Path("output"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "render":
        fingerprint = json.loads(args.input.read_text(encoding="utf-8"))
        write_delivery(args.output, fingerprint)
        print(args.output / "index.html")
        return 0

    raw_directory = args.output / "raw"
    grids = None
    if not args.reuse_raw:
        grids = download_climate_assets(
            args.lat,
            args.lon,
            raw_directory,
            credentials_path=args.credentials,
        )
    build_from_raw_assets(
        args.lat,
        args.lon,
        raw_directory,
        args.output,
        tile_id=args.tile_id,
        grids=grids,
    )
    print(args.output / "index.html")
    return 0
