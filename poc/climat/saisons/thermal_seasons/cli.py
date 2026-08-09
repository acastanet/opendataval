"""Interface en ligne de commande du package thermal_seasons."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from . import schema
from .fetch import download_era5_land, read_temperature
from .pipeline import compute
from .render_html import render_html, render_responsive_html
from .render_svg import render_thermal_seasons_svg


DEFAULT_TILE = "GPD-44.064654-3.682935"
DEFAULT_LAT = 44.06465392551458
DEFAULT_LON = 3.6829349237761435


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Saisons thermiques locales (V1)")
    commands = parser.add_subparsers(dest="command", required=True)

    build = commands.add_parser("build", help="télécharge ERA5-Land et produit les livrables")
    build.add_argument("--lat", type=float, default=DEFAULT_LAT)
    build.add_argument("--lon", type=float, default=DEFAULT_LON)
    build.add_argument("--tile-id", default=DEFAULT_TILE)
    build.add_argument("--output", type=Path, default=Path("output"))
    build.add_argument("--credentials", type=Path, help="chemin vers .cdsapirc (local par défaut)")
    build.add_argument("--reuse-raw", action="store_true", help="réutilise output/raw")

    render = commands.add_parser("render", help="réexporte JSON/SVG/HTML depuis un JSON")
    render.add_argument("--input", type=Path, required=True)
    render.add_argument("--output", type=Path, default=Path("output"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    output: Path = args.output
    output.mkdir(parents=True, exist_ok=True)

    if args.command == "render":
        document = json.loads(args.input.read_text(encoding="utf-8"))
        svg = render_thermal_seasons_svg(document)
        html = render_html(document, svg)
        (output / "thermal-seasons.json").write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (output / "thermal-seasons.svg").write_text(svg, encoding="utf-8")
        (output / "thermal-seasons-preview.html").write_text(html, encoding="utf-8")
        (output / "thermal-seasons-responsive.html").write_text(
            render_responsive_html(svg), encoding="utf-8")
        print(output / "thermal-seasons-preview.html")
        return 0

    raw_dir = output / "raw"
    if not args.reuse_raw:
        grids = download_era5_land(
            args.lat, args.lon, raw_dir, credentials_path=args.credentials)
        grid_lat = grids["era5_land"].latitude
        grid_lon = grids["era5_land"].longitude
        cred = "local .cdsapirc" if args.credentials is None else str(args.credentials)
        retrieved_at = datetime.now(timezone.utc).isoformat()
    else:
        # Les fichiers bruts ne portent pas à eux seuls les métadonnées du point
        # de grille. Lors d'un recalcul depuis le cache, on conserve donc la
        # provenance déjà publiée avec ce même répertoire de sortie.
        previous = {}
        previous_path = output / "thermal-seasons.json"
        if previous_path.exists():
            previous = json.loads(previous_path.read_text(encoding="utf-8")).get("source", {})
        grid_lat = previous.get("grid_lat")
        grid_lon = previous.get("grid_lon")
        cred = previous.get("credentials_source") or "reused raw"
        retrieved_at = previous.get("retrieved_at") or datetime.now(timezone.utc).isoformat()

    temperature = read_temperature(raw_dir)
    document = compute(
        temperature,
        tile_id=args.tile_id,
        lat=args.lat, lon=args.lon,
        grid_lat=grid_lat, grid_lon=grid_lon,
        retrieved_at=retrieved_at,
        credentials_source=cred,
    )

    svg = render_thermal_seasons_svg(document)
    html = render_html(document, svg)
    (output / "thermal-seasons.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "thermal-seasons.svg").write_text(svg, encoding="utf-8")
    (output / "thermal-seasons-preview.html").write_text(html, encoding="utf-8")
    (output / "thermal-seasons-responsive.html").write_text(
        render_responsive_html(svg), encoding="utf-8")
    print(output / "thermal-seasons-preview.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
