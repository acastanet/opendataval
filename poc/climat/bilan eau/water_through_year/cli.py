"""Commande build/render de « L'eau au fil de l'année »."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .fetch import download_assets, read_land_monthly_netcdf, read_spei3_netcdf
from .pipeline import compute
from .render_html import render_html
from .render_svg import render_water_through_year_svg


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Infographie hydroclimatique ERA5-Land / ERA5-Drought")
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build", help="télécharge (ou réutilise) les données et produit les livrables")
    build.add_argument("--lat", type=float, required=True)
    build.add_argument("--lon", type=float, required=True)
    build.add_argument("--tile-id")
    build.add_argument("--output", type=Path, default=Path("output"))
    build.add_argument("--credentials", type=Path)
    build.add_argument("--reuse-raw", action="store_true")
    render = commands.add_parser("render", help="réexporte SVG et HTML depuis un JSON existant")
    render.add_argument("--input", type=Path, required=True)
    render.add_argument("--output", type=Path, default=Path("output"))
    return parser


def _write(document: dict, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    svg = render_water_through_year_svg(document)
    (output / "water-through-year.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "water-through-year.svg").write_text(svg, encoding="utf-8")
    (output / "water-through-year-preview.html").write_text(render_html(document, svg), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "render":
        doc = json.loads(args.input.read_text(encoding="utf-8"))
        _write(doc, args.output)
        print(args.output / "water-through-year-preview.html")
        return 0
    raw = args.output / "raw"
    rep = download_assets(args.lat, args.lon, raw, credentials_path=args.credentials) if not args.reuse_raw else {
        "grid_lat": None, "grid_lon": None, "grid_resolution_deg": .1, "native_resolution_km": 9,
    }
    document = compute(read_land_monthly_netcdf(raw), read_spei3_netcdf(raw / "era5-drought-spei3.nc", latitude=rep.get("drought_grid_lat"), longitude=rep.get("drought_grid_lon")), tile_id=args.tile_id,
                       lat=args.lat, lon=args.lon, representativity=rep,
                       dataset_version="ERA5-Land monthly means / ERA5-Drought", retrieved_at=datetime.now(timezone.utc).isoformat(),
                       era5_land_frequency="monthly_mean_daily")
    _write(document, args.output)
    print(args.output / "water-through-year-preview.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
