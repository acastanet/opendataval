from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service import replay_snapshot  # noqa: E402
from climate_seasons_service.compute import ThermalSeasonsInput  # noqa: E402
from climate_seasons_service.result import ResultContext  # noqa: E402
from climate_seasons_service.snapshot import load_snapshot, read_temperature, verify_snapshot_asset  # noqa: E402
from climate_seasons_service.v2 import build_climate_result_v2  # noqa: E402
from climate_seasons_service.v3 import build_climate_result_v3  # noqa: E402

FIELDS = (
    "spring_start_shift_days",
    "summer_start_shift_days",
    "autumn_start_shift_days",
    "winter_start_shift_days",
    "summer_length_change_days",
)
BOUNDARIES = (
    "spring_start_doy",
    "summer_start_doy",
    "autumn_start_doy",
    "winter_start_doy",
    "summer_length_days",
)


def _context(snapshot: dict, generated_at: str | None) -> ResultContext:
    requested = snapshot.get("requested_location") or {}
    geometry = requested.get("geometry") or {}
    coordinates = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coordinates, list) or len(coordinates) != 2:
        raise ValueError("Le replay V3 attend un Point")
    longitude, latitude = coordinates
    asset = snapshot["assets"][0]
    represented = asset.get("represented_spatial") or {}
    retrieval = asset.get("retrieval") or {}
    return ResultContext(
        tile_id=str(requested.get("tile_id") or requested.get("label")),
        latitude=float(latitude),
        longitude=float(longitude),
        snapshot_id=str(snapshot["snapshot_id"]),
        grid_latitude=float(represented["lat"]),
        grid_longitude=float(represented["lon"]),
        retrieved_at=str(retrieval.get("retrieved_at")),
        generated_at=generated_at,
    )


def _delta(left: object, right: object) -> float | None:
    if not isinstance(left, (int, float)) or not isinstance(right, (int, float)):
        return None
    return round(float(right) - float(left), 2)


def _comparison(result: dict) -> dict:
    return result["data"]["comparison"]


def compare(manifest_path: Path, *, generated_at: str | None = None) -> tuple[dict, dict, dict, dict]:
    snapshot = load_snapshot(manifest_path)
    asset_path = verify_snapshot_asset(snapshot, manifest_path)
    temperature = read_temperature(asset_path)
    ctx = _context(snapshot, generated_at)

    v1 = replay_snapshot(manifest_path, generated_at=generated_at)
    v2 = build_climate_result_v2(ThermalSeasonsInput(temperature_c=temperature), context=ctx)
    v3 = build_climate_result_v3(ThermalSeasonsInput(temperature_c=temperature), context=ctx)

    comparisons = {}
    for field in FIELDS:
        v1_value = _comparison(v1).get(field)
        v2_value = _comparison(v2).get(field)
        v3_value = _comparison(v3).get(field)
        comparisons[field] = {
            "v1": v1_value,
            "v2": v2_value,
            "v3": v3_value,
            "v2_minus_v1": _delta(v1_value, v2_value),
            "v3_minus_v1": _delta(v1_value, v3_value),
            "v3_minus_v2": _delta(v2_value, v3_value),
        }

    annual_maps = {
        "v1": {entry["year"]: entry for entry in v1["data"]["annual"]},
        "v2": {entry["year"]: entry for entry in v2["data"]["annual"]},
        "v3": {entry["year"]: entry for entry in v3["data"]["annual"]},
    }
    annual = []
    for year in range(1996, 2026):
        left = annual_maps["v1"][year]
        middle = annual_maps["v2"][year]
        right = annual_maps["v3"][year]
        annual.append(
            {
                "year": year,
                "v1_status": left.get("status"),
                "v2_status": middle.get("status"),
                "v3_status": right.get("status"),
                "v2_fit_rmse_c": middle.get("fit_rmse_c"),
                "v3_fit_rmse_c": right.get("fit_rmse_c"),
                "v2_smoother_crossing_spread_days": middle.get("smoother_crossing_spread_days"),
                "v3_principal_regime_spread_days": right.get("smoother_crossing_spread_days"),
                "v3_qa_reasons": right.get("qa_reasons"),
                "v3_minus_v1": {field: _delta(left.get(field), right.get(field)) for field in BOUNDARIES},
                "v3_minus_v2": {field: _delta(middle.get(field), right.get(field)) for field in BOUNDARIES},
            }
        )

    v2_quality = v2["data"]["quality"]
    v3_quality = v3["data"]["quality"]
    v2_spread = v2["data"]["qa"]["smoother_sensitivity"]["study_distribution"]
    v3_spread = v3["data"]["qa"]["smoother_sensitivity"]["study_distribution"]

    report = {
        "schema_version": "1.0",
        "snapshot_id": snapshot["snapshot_id"],
        "methods": {"v1": v1["method"], "v2": v2["method"], "v3": v3["method"]},
        "comparison": comparisons,
        "annual": annual,
        "v1_quality": v1["quality"],
        "v2_quality": v2["quality"],
        "v3_quality": v3["quality"],
        "v2_qa": v2["data"]["qa"],
        "v3_qa": v3["data"]["qa"],
        "automatic_checks": {
            "same_snapshot": v1["snapshot_id"] == v2["snapshot_id"] == v3["snapshot_id"],
            "v3_early_has_at_least_8_ok_years": v3_quality["early_ok"] >= 8,
            "v3_late_has_at_least_8_ok_years": v3_quality["late_ok"] >= 8,
            "five_v3_signals_available": len(v3["signals"]) == 5,
            "v3_max_sensitivity_below_v2_max": (
                isinstance(v3_spread.get("max"), (int, float))
                and isinstance(v2_spread.get("max"), (int, float))
                and float(v3_spread["max"]) < float(v2_spread["max"])
            ),
        },
        "scientific_review_required": True,
        "publication_authorized": False,
        "note": (
            "V3 conserve les lissages et seuils QA V2 mais remplace le premier franchissement "
            "par l'intervalle principal T25/T75 contenant le maximum annuel."
        ),
    }
    return v1, v2, v3, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay comparatif thermal-seasons V1 / V2 rejetée / candidat V3")
    parser.add_argument("snapshot", type=Path, help="ClimateSnapshot saisons contenant era5-land.csv")
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--generated-at", default=None)
    args = parser.parse_args()

    output_dir = args.output_dir or args.snapshot.resolve().parent
    output_dir.mkdir(parents=True, exist_ok=True)
    v1, v2, v3, report = compare(args.snapshot, generated_at=args.generated_at)

    outputs = {
        "v1": output_dir / "thermal-seasons-v1-replay.json",
        "v2": output_dir / "thermal-seasons-v2-rejected.json",
        "v3": output_dir / "thermal-seasons-v3-candidate.json",
        "comparison": output_dir / "thermal-seasons-v1-v2-v3-comparison.json",
    }
    outputs["v1"].write_text(json.dumps(v1, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    outputs["v2"].write_text(json.dumps(v2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    outputs["v3"].write_text(json.dumps(v3, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    outputs["comparison"].write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({key: str(path) for key, path in outputs.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
