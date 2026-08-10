from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service import (  # noqa: E402
    assert_thermal_seasons_equivalent,
    build_snapshot_manifest,
    replay_snapshot,
    request_parameters,
    sha256_file,
    write_snapshot_manifest,
    write_thermal_seasons_result_svg,
)

GOLDEN = REPO_ROOT / "poc" / "climat" / "saisons" / "tests" / "fixtures" / "thermal-seasons-fixture.json"
LAT = 44.06465392551458
LON = 3.6829349237761435
TILE_ID = "GPD-44.064654-3.682935"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay P6/P7 thermal-seasons contre le golden master V1")
    parser.add_argument("raw_directory", type=Path, help="Dossier contenant era5-land.csv")
    parser.add_argument("--retrieved-at", help="Horodatage réel CDS ; défaut : provenance du golden master")
    parser.add_argument("--work-directory", type=Path)
    args = parser.parse_args()

    raw = args.raw_directory.resolve()
    asset = raw / "era5-land.csv"
    if not asset.is_file():
        raise SystemExit(f"Fichier absent: {asset}")

    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    retrieved_at = args.retrieved_at or golden["source"]["retrieved_at"]
    grid, request = request_parameters(LAT, LON)
    verified_at = _now()
    work = (args.work_directory or (raw.parent / "p6-seasons-replay")).resolve()
    work.mkdir(parents=True, exist_ok=True)

    manifest = build_snapshot_manifest(
        raw,
        snapshot_id=f"SNAPSHOT-THERMAL-SEASONS-V1-{verified_at.replace(':', '').replace('-', '')}",
        tile_id=TILE_ID,
        latitude=LAT,
        longitude=LON,
        created_at=verified_at,
        retrieved_at=retrieved_at,
        grid_latitude=grid.latitude,
        grid_longitude=grid.longitude,
        request_parameters=request,
    )
    manifest_path = write_snapshot_manifest(raw, manifest)
    result = replay_snapshot(manifest_path, generated_at=verified_at)
    result_path = work / "climate-result.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    svg_path = work / "thermal-seasons-v1-neutral.svg"
    write_thermal_seasons_result_svg(result, svg_path)

    status = "pass"
    error = None
    try:
        assert_thermal_seasons_equivalent(result["data"], golden)
    except AssertionError as exc:
        status = "fail"
        error = str(exc)

    report = {
        "status": status,
        "method": {"id": "thermal-seasons", "version": "1.0.0"},
        "verified_at": verified_at,
        "retrieved_at": retrieved_at,
        "numeric_tolerance": 0.0,
        "render_variant": "v5-neutral",
        "asset": {
            "path": str(asset),
            "sha256": sha256_file(asset),
        },
        "snapshot": str(manifest_path),
        "result": str(result_path),
        "svg": str(svg_path),
        "golden_master": str(GOLDEN),
    }
    if error:
        report["error"] = error
    report_path = work / "golden-replay-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if status == "pass":
        print("\nPASS — thermal-seasons P6 reproduit le golden master V1 à tolérance nulle.")
        print(f"SVG — {svg_path}")
        return 0
    print("\nFAIL — thermal-seasons P6 diffère du golden master V1.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
