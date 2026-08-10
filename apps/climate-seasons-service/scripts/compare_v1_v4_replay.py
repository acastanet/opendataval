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
from climate_seasons_service.v4 import build_climate_result_v4  # noqa: E402

FIELDS = (
    "spring_start_shift_days",
    "summer_start_shift_days",
    "autumn_start_shift_days",
    "winter_start_shift_days",
    "summer_length_change_days",
)


def _context(snapshot: dict, generated_at: str | None) -> ResultContext:
    requested = snapshot.get("requested_location") or {}
    geometry = requested.get("geometry") or {}
    coordinates = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coordinates, list) or len(coordinates) != 2:
        raise ValueError("Le replay V4 attend un Point")
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


def _delta(v1: object, v4: object) -> float | None:
    if not isinstance(v1, (int, float)) or not isinstance(v4, (int, float)):
        return None
    return round(float(v4) - float(v1), 2)


def compare(manifest_path: Path, *, generated_at: str | None = None) -> tuple[dict, dict, dict]:
    snapshot = load_snapshot(manifest_path)
    asset_path = verify_snapshot_asset(snapshot, manifest_path)
    temperature = read_temperature(asset_path)
    v1 = replay_snapshot(manifest_path, generated_at=generated_at)
    v4 = build_climate_result_v4(ThermalSeasonsInput(temperature_c=temperature), context=_context(snapshot, generated_at))
    v1_comparison = v1["data"]["comparison"]
    v4_comparison = v4["data"]["comparison"]
    report = {
        "schema_version": "1.0",
        "snapshot_id": snapshot["snapshot_id"],
        "methods": {"v1": v1["method"], "v4": v4["method"]},
        "comparison": {
            field: {"v1": v1_comparison.get(field), "v4": v4_comparison.get(field), "v4_minus_v1": _delta(v1_comparison.get(field), v4_comparison.get(field))}
            for field in FIELDS
        },
        "v1_quality": v1["quality"],
        "v4_quality": v4["quality"],
        "v4_decades": v4["data"]["decades"],
        "v4_qa": v4["data"]["qa"],
        "v4_bootstrap": v4["data"]["qa"]["bootstrap"],
        "automatic_checks": {
            "same_snapshot": v1["snapshot_id"] == v4["snapshot_id"],
            "shared_reference_thresholds": v4["data"]["thresholds"]["reference_period"] == "1991-2020",
            "both_decades_robust": v4["data"]["quality"]["decades_ok"] == 2,
            "five_v4_signals_available": len(v4["signals"]) == 5,
        },
        "scientific_review_required": True,
        "publication_authorized": False,
    }
    return v1, v4, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay comparatif thermal-seasons V1 / candidat V4")
    parser.add_argument("snapshot", type=Path, help="ClimateSnapshot saisons contenant era5-land.csv")
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--generated-at", default=None)
    args = parser.parse_args()

    output_dir = args.output_dir or args.snapshot.resolve().parent
    output_dir.mkdir(parents=True, exist_ok=True)
    v1, v4, report = compare(args.snapshot, generated_at=args.generated_at)
    outputs = {
        "v1": output_dir / "thermal-seasons-v1-replay.json",
        "v4": output_dir / "thermal-seasons-v4-replay.json",
        "comparison": output_dir / "thermal-seasons-v1-v4-comparison.json",
        "bootstrap": output_dir / "thermal-seasons-v4-bootstrap.json",
    }
    for key, value in (("v1", v1), ("v4", v4), ("comparison", report), ("bootstrap", v4["data"]["qa"]["bootstrap"])):
        outputs[key].write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: str(path) for key, path in outputs.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
