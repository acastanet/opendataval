from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SOURCES = (
    REPO_ROOT / "apps" / "climate-overview-service" / "src",
    REPO_ROOT / "apps" / "climate-fingerprint-service" / "src",
    REPO_ROOT / "apps" / "climate-seasons-service" / "src",
    REPO_ROOT / "apps" / "climate-water-service" / "src",
)
for source in SERVICE_SOURCES:
    if str(source) not in sys.path:
        sys.path.insert(0, str(source))

from climate_fingerprint_service import write_fingerprint_result_svg  # noqa: E402
from climate_overview_service import write_overview_result_svg  # noqa: E402
from climate_seasons_service import write_thermal_seasons_result_svg  # noqa: E402
from climate_water_service.renderer import write_water_result_svg  # noqa: E402

DEFAULT_OVERVIEW = REPO_ROOT / "poc" / "climat" / "saisons" / "output" / "p6-overview-replay" / "climate-result.json"
DEFAULT_FINGERPRINT = REPO_ROOT / "poc" / "climat" / "saisons" / "output" / "p6-replay" / "climate-result.json"
DEFAULT_SEASONS = REPO_ROOT / "poc" / "climat" / "saisons" / "output" / "p6-seasons-replay" / "climate-result.json"
DEFAULT_WATER = REPO_ROOT / "poc" / "climat" / "bilan eau" / "output" / "p6-water-replay" / "climate-result.json"
DEFAULT_OUTPUT = REPO_ROOT / "apps" / "web" / "public" / "climat" / "generated"

EXPECTED_METHODS = {
    "overview": ("climate-overview", "1.0.0"),
    "fingerprint": ("climate-fingerprint", "4.0.0"),
    "seasons": ("thermal-seasons", "1.0.0"),
    "water": ("water-through-year", "1.0.0"),
}


def _load(path: Path, key: str) -> dict:
    if not path.is_file():
        raise SystemExit(f"ClimateResult absent pour {key}: {path}")
    result = json.loads(path.read_text(encoding="utf-8"))
    method = result.get("method") or {}
    expected_id, expected_version = EXPECTED_METHODS[key]
    if method.get("id") != expected_id or method.get("version") != expected_version:
        raise SystemExit(
            f"Méthode inattendue pour {key}: {method.get('id')}@{method.get('version')} "
            f"(attendu {expected_id}@{expected_version})"
        )
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Assemble les quatre ClimateResult validés en SVG statiques pour /climat/."
    )
    parser.add_argument("--overview", type=Path, default=DEFAULT_OVERVIEW)
    parser.add_argument("--fingerprint", type=Path, default=DEFAULT_FINGERPRINT)
    parser.add_argument("--seasons", type=Path, default=DEFAULT_SEASONS)
    parser.add_argument("--water", type=Path, default=DEFAULT_WATER)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return parser


def main() -> int:
    args = _parser().parse_args()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)

    overview = _load(args.overview.resolve(), "overview")
    fingerprint = _load(args.fingerprint.resolve(), "fingerprint")
    seasons = _load(args.seasons.resolve(), "seasons")
    water = _load(args.water.resolve(), "water")

    files = {
        "overview": "climate-overview-v1-neutral.svg",
        "fingerprint": "climate-fingerprint-v4-neutral.svg",
        "seasons": "thermal-seasons-v1-neutral.svg",
        "water": "water-through-year-v1-neutral.svg",
    }

    write_overview_result_svg(overview, output / files["overview"])
    write_fingerprint_result_svg(fingerprint, output / files["fingerprint"], theme="neutral")
    write_thermal_seasons_result_svg(seasons, output / files["seasons"])
    write_water_result_svg(water, output / files["water"])

    manifest = {
        "schema_version": "1.0",
        "product": "climate-sheet-static",
        "analyses": [
            {"id": key, "method": {"id": EXPECTED_METHODS[key][0], "version": EXPECTED_METHODS[key][1]}, "svg": filename}
            for key, filename in files.items()
        ],
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(output)
    for filename in files.values():
        print(f"- {filename}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
