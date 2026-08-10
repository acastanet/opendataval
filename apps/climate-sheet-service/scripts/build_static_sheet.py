from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_OVERVIEW = REPO_ROOT / "poc" / "climat" / "general" / "climate" / "overview" / "outputs" / "zone_test_utilisateur_climate-overview.json"
DEFAULT_FINGERPRINT = REPO_ROOT / "poc" / "climat" / "empreinte-climatique" / "example" / "climate-fingerprint-v4.json"
DEFAULT_SEASONS = REPO_ROOT / "doc" / "climat" / "validations" / "data" / "thermal-seasons-v4" / "thermal-seasons-v4-replay.json"
DEFAULT_WATER = REPO_ROOT / "poc" / "climat" / "bilan eau" / "output" / "water-through-year.json"
DEFAULT_OUTPUT = REPO_ROOT / "apps" / "web" / "public" / "climat" / "generated"
COMMENTARY_FILENAME = "climate-commentary.json"
SEASONS_FILENAME = "thermal-seasons-v4.json"

EXPECTED_METHODS = {
    "overview": ("climate-overview", "1.0.0"),
    "fingerprint": ("climate-fingerprint", "4.0.0"),
    "seasons": ("thermal-seasons", "4.0.0"),
    "water": ("water-through-year", "1.0.0"),
}
EXPECTED_METHOD_REFS = {value for value in EXPECTED_METHODS.values()}

RENDERER_FILES = {
    "overview": REPO_ROOT / "apps" / "climate-overview-service" / "src" / "climate_overview_service" / "renderer.py",
    "fingerprint": REPO_ROOT / "apps" / "climate-fingerprint-service" / "src" / "climate_fingerprint_service" / "renderer.py",
    "water": REPO_ROOT / "apps" / "climate-water-service" / "src" / "climate_water_service" / "renderer.py",
}


def _load_renderer(key: str) -> ModuleType:
    path = RENDERER_FILES[key]
    module_name = f"climate_sheet_{key}_renderer"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Renderer impossible à charger pour {key}: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _as_climate_result(payload: dict, key: str) -> dict:
    expected_id, expected_version = EXPECTED_METHODS[key]
    method = payload.get("method")
    if isinstance(method, dict) and method.get("id") == expected_id:
        if method.get("version") != expected_version:
            raise SystemExit(
                f"Version inattendue pour {key}: {method.get('version')} (attendu {expected_version})"
            )
        return payload
    return {
        "product": {"id": expected_id},
        "method": {"id": expected_id, "version": expected_version},
        "data": payload,
    }


def _load(path: Path, key: str) -> dict:
    if not path.is_file():
        raise SystemExit(f"Entrée climat absente pour {key}: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SystemExit(f"Entrée climat invalide pour {key}: {path}")
    return _as_climate_result(payload, key)


def _commentary_method_refs(commentary: dict) -> set[tuple[str, str]]:
    refs: set[tuple[str, str]] = set()
    for ref in commentary.get("method_refs") or []:
        if not isinstance(ref, dict):
            continue
        refs.add((str(ref.get("id", "")), str(ref.get("version", ""))))
    return refs


def _load_validated_commentary(path: Path) -> dict:
    if not path.is_file():
        raise SystemExit(f"ClimateCommentary absent : {path}")
    commentary = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(commentary, dict):
        raise SystemExit(f"ClimateCommentary invalide : {path}")
    validation = commentary.get("validation") or {}
    if commentary.get("scope") != "sheet":
        raise SystemExit("ClimateCommentary attendu avec scope=sheet")
    if validation.get("status") != "valid":
        raise SystemExit("ClimateCommentary non validé : publication refusée")
    if validation.get("all_findings_have_signal_evidence") is not True:
        raise SystemExit("ClimateCommentary sans ancrage complet : publication refusée")
    if validation.get("unsupported_claims"):
        raise SystemExit("ClimateCommentary contient des claims non supportés : publication refusée")
    if _commentary_method_refs(commentary) != EXPECTED_METHOD_REFS:
        raise SystemExit(
            "ClimateCommentary produit pour des versions différentes de la fiche : publication refusée"
        )
    for finding in commentary.get("findings") or []:
        if not finding.get("signal_ids"):
            raise SystemExit("ClimateCommentary contient un finding sans signal_id")
    return commentary


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Assemble les actifs statiques de /climat/.")
    parser.add_argument("--overview", type=Path, default=DEFAULT_OVERVIEW)
    parser.add_argument("--fingerprint", type=Path, default=DEFAULT_FINGERPRINT)
    parser.add_argument("--seasons", type=Path, default=DEFAULT_SEASONS)
    parser.add_argument("--water", type=Path, default=DEFAULT_WATER)
    parser.add_argument("--commentary", type=Path)
    parser.add_argument(
        "--keep-existing-commentary",
        action="store_true",
        help="Conserve un climate-commentary.json déjà présent si --commentary est absent.",
    )
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
    water_renderer = _load_renderer("water")

    files = {
        "overview": "climate-overview-v1-neutral.svg",
        "fingerprint": "climate-fingerprint-v4-neutral.svg",
        "seasons": SEASONS_FILENAME,
        "water": "water-through-year-v1-neutral.svg",
    }

    overview_renderer.write_overview_result_svg(overview, output / files["overview"])
    fingerprint_renderer.write_fingerprint_result_svg(fingerprint, output / files["fingerprint"], theme="neutral")
    water_renderer.write_water_result_svg(water, output / files["water"])
    (output / SEASONS_FILENAME).write_text(
        json.dumps(seasons, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    commentary_file = output / COMMENTARY_FILENAME
    commentary_manifest = None
    if args.commentary:
        commentary = _load_validated_commentary(args.commentary.resolve())
        commentary_file.write_text(
            json.dumps(commentary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        commentary_manifest = COMMENTARY_FILENAME
    elif args.keep_existing_commentary and commentary_file.is_file():
        _load_validated_commentary(commentary_file)
        commentary_manifest = COMMENTARY_FILENAME
    elif commentary_file.exists():
        commentary_file.unlink()

    manifest = {
        "schema_version": "1.1",
        "product": "climate-sheet-static",
        "analyses": [
            {
                "id": key,
                "method": {"id": EXPECTED_METHODS[key][0], "version": EXPECTED_METHODS[key][1]},
                "asset": files[key],
                "asset_type": "climate-result" if key == "seasons" else "svg",
            }
            for key in ("overview", "fingerprint", "seasons", "water")
        ],
    }
    if commentary_manifest:
        manifest["commentary"] = commentary_manifest

    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(output)
    for filename in files.values():
        print(f"- {filename}")
    if commentary_manifest:
        print(f"- {commentary_manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
