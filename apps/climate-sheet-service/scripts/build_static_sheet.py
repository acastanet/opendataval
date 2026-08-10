from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[3]
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

RENDERER_FILES = {
    "overview": REPO_ROOT / "apps" / "climate-overview-service" / "src" / "climate_overview_service" / "renderer.py",
    "fingerprint": REPO_ROOT / "apps" / "climate-fingerprint-service" / "src" / "climate_fingerprint_service" / "renderer.py",
    "seasons": REPO_ROOT / "apps" / "climate-seasons-service" / "src" / "climate_seasons_service" / "renderer.py",
    "water": REPO_ROOT / "apps" / "climate-water-service" / "src" / "climate_water_service" / "renderer.py",
}


def _load_renderer(key: str) -> ModuleType:
    """Charge uniquement renderer.py, sans exécuter le __init__ du service scientifique."""
    path = RENDERER_FILES[key]
    spec = importlib.util.spec_from_file_location(f"climate_sheet_{key}_renderer", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Renderer impossible à charger pour {key}: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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

    overview_renderer = _load_renderer("overview")
    fingerprint_renderer = _load_renderer("fingerprint")
    seasons_renderer = _load_renderer("seasons")
    water_renderer = _load_renderer("water")

    files = {
        "overview": "climate-overview-v1-neutral.svg",
        "fingerprint": "climate-fingerprint-v4-neutral.svg",
        "seasons": "thermal-seasons-v1-neutral.svg",
        "water": "water-through-year-v1-neutral.svg",
    }

    overview_renderer.write_overview_result_svg(overview, output / files["overview"])
    fingerprint_renderer.write_fingerprint_result_svg(fingerprint, output / files["fingerprint"], theme="neutral")
    seasons_renderer.write_thermal_seasons_result_svg(seasons, output / files["seasons"])
    water_renderer.write_water_result_svg(water, output / files["water"])

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
