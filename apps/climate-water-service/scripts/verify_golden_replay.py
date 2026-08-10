from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_water_service import (  # noqa: E402
    assert_water_equivalent,
    build_snapshot_manifest,
    replay_snapshot,
    request_parameters,
    sha256_file,
    write_snapshot_manifest,
)

GOLDEN = REPO_ROOT / "poc" / "climat" / "bilan eau" / "output" / "water-through-year.json"
LAT = 44.06462321251746
LON = 3.682972784135697
TILE_ID = "GPD-44.064623-3.682973"
EXPECTED = ("era5-land-monthly.nc", "era5-drought-spei3.nc")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay P6 water-through-year contre le golden master V1")
    parser.add_argument("raw_directory", type=Path, help="Dossier contenant les deux NetCDF Copernicus")
    parser.add_argument("--retrieved-at", help="Horodatage réel CDS ; défaut : provenance du golden master")
    parser.add_argument("--work-directory", type=Path)
    args = parser.parse_args()

    raw = args.raw_directory.resolve()
    missing = [name for name in EXPECTED if not (raw / name).is_file()]
    if missing:
        raise SystemExit("Dossier raw incomplet : " + ", ".join(missing))
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    retrieved_at = args.retrieved_at or golden["sources"]["retrieved_at"]
    dataset_version = golden["sources"].get("dataset_version")
    land_grid, drought_grid, land_request, drought_request = request_parameters(LAT, LON)
    verified_at = _now()
    work = (args.work_directory or (raw.parent / "p6-water-replay")).resolve()
    work.mkdir(parents=True, exist_ok=True)

    manifest = build_snapshot_manifest(
        raw,
        snapshot_id=f"SNAPSHOT-WATER-V1-{verified_at.replace(':', '').replace('-', '')}",
        tile_id=TILE_ID,
        latitude=LAT,
        longitude=LON,
        created_at=verified_at,
        retrieved_at=retrieved_at,
        land_grid_latitude=land_grid.latitude,
        land_grid_longitude=land_grid.longitude,
        drought_grid_latitude=drought_grid.latitude,
        drought_grid_longitude=drought_grid.longitude,
        land_request_parameters=land_request,
        drought_request_parameters=drought_request,
        dataset_version=dataset_version,
    )
    manifest_path = write_snapshot_manifest(raw, manifest)
    result = replay_snapshot(manifest_path, generated_at=verified_at)
    result_path = work / "climate-result.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    status, error = "pass", None
    try:
        assert_water_equivalent(result["data"], golden)
    except AssertionError as exc:
        status, error = "fail", str(exc)

    report = {
        "status": status,
        "method": {"id": "water-through-year", "version": "1.0.0"},
        "verified_at": verified_at,
        "retrieved_at": retrieved_at,
        "numeric_tolerance": 0.0,
        "assets": [
            {"path": str(raw / name), "sha256": sha256_file(raw / name)}
            for name in EXPECTED
        ],
        "snapshot": str(manifest_path),
        "result": str(result_path),
        "golden_master": str(GOLDEN),
    }
    if error:
        report["error"] = error
    report_path = work / "golden-replay-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if status == "pass":
        print("\nPASS — water-through-year P6 reproduit le golden master V1 à tolérance nulle.")
        return 0
    print("\nFAIL — water-through-year P6 diffère du golden master V1.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
