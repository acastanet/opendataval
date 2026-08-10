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
        raise ValueError("Le replay V2 attend un Point")
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


def _delta(v1: object, v2: object) -> float | None:
    if not isinstance(v1, (int, float)) or not isinstance(v2, (int, float)):
        return None
    return round(float(v2) - float(v1), 2)


def compare(manifest_path: Path, *, generated_at: str | None = None) -> tuple[dict, dict, dict]:
    snapshot = load_snapshot(manifest_path)
    asset_path = verify_snapshot_asset(snapshot, manifest_path)
    temperature = read_temperature(asset_path)

    v1 = replay_snapshot(manifest_path, generated_at=generated_at)
    v2 = build_climate_result_v2(
        ThermalSeasonsInput(temperature_c=temperature),
        context=_context(snapshot, generated_at),
    )

    v1_comparison = v1["data"]["comparison"]
    v2_comparison = v2["data"]["comparison"]
    comparison = {
        field: {
            "v1": v1_comparison.get(field),
            "v2": v2_comparison.get(field),
            "v2_minus_v1": _delta(v1_comparison.get(field), v2_comparison.get(field)),
        }
        for field in FIELDS
    }

    v1_annual = {entry["year"]: entry for entry in v1["data"]["annual"]}
    v2_annual = {entry["year"]: entry for entry in v2["data"]["annual"]}
    annual = []
    for year in range(1996, 2026):
        left = v1_annual[year]
        right = v2_annual[year]
        annual.append(
            {
                "year": year,
                "v1_status": left.get("status"),
                "v2_status": right.get("status"),
                "v2_fit_rmse_c": right.get("fit_rmse_c"),
                "v2_smoother_crossing_spread_days": right.get("smoother_crossing_spread_days"),
                "differences": {
                    field: _delta(left.get(field), right.get(field))
                    for field in BOUNDARIES
                },
            }
        )

    quality = v2["data"]["quality"]
    report = {
        "schema_version": "1.0",
        "snapshot_id": snapshot["snapshot_id"],
        "methods": {"v1": v1["method"], "v2": v2["method"]},
        "comparison": comparison,
        "annual": annual,
        "v1_quality": v1["quality"],
        "v2_quality": v2["quality"],
        "v2_qa": v2["data"]["qa"],
        "automatic_checks": {
            "early_has_at_least_8_ok_years": quality["early_ok"] >= 8,
            "late_has_at_least_8_ok_years": quality["late_ok"] >= 8,
            "five_v2_signals_available": len(v2["signals"]) == 5,
        },
        "scientific_review_required": True,
        "publication_authorized": False,
        "note": "Ce rapport compare les deux méthodes sur le même ClimateSnapshot ; il n'autorise pas à lui seul le passage de V2 à validated.",
    }
    return v1, v2, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay comparatif thermal-seasons V1 / candidat V2")
    parser.add_argument("snapshot", type=Path, help="ClimateSnapshot saisons contenant era5-land.csv")
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--generated-at", default=None)
    args = parser.parse_args()

    output_dir = args.output_dir or args.snapshot.resolve().parent
    output_dir.mkdir(parents=True, exist_ok=True)
    v1, v2, report = compare(args.snapshot, generated_at=args.generated_at)

    outputs = {
        "v1": output_dir / "thermal-seasons-v1-replay.json",
        "v2": output_dir / "thermal-seasons-v2-candidate.json",
        "comparison": output_dir / "thermal-seasons-v1-v2-comparison.json",
    }
    outputs["v1"].write_text(json.dumps(v1, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    outputs["v2"].write_text(json.dumps(v2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    outputs["comparison"].write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({key: str(path) for key, path in outputs.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
