from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_overview_service import (  # noqa: E402
    assert_overview_equivalent,
    build_snapshot_manifest,
    replay_snapshot,
    request_parameters,
    sha256_file,
    write_snapshot_manifest,
)

GOLDEN = REPO_ROOT / "poc" / "climat" / "general" / "climate" / "overview" / "outputs" / "zone_test_utilisateur_climate-overview.json"
LAT = 44.06462321251746
LON = 3.682972784135697
TILE_ID = "GPD-44.064623-3.682973"
EXPECTED = ("era5-land.csv", "era5-land-precipitation.csv")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _existing_retrieval(raw: Path) -> tuple[str | None, str | None]:
    """Réutilise la provenance du snapshot empreinte s'il existe dans le dossier partagé."""
    path = raw / "climate-snapshot.json"
    if not path.is_file():
        return None, None
    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
        for asset in snapshot.get("assets", []):
            if asset.get("asset_id") == "era5-land-temperature":
                retrieval = asset.get("retrieval") or {}
                return retrieval.get("retrieved_at"), retrieval.get("dataset_version")
    except (OSError, ValueError, TypeError):
        pass
    return None, None


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay P6 climate-overview contre le golden master V1")
    parser.add_argument("raw_directory", type=Path, help="Dossier contenant era5-land.csv et era5-land-precipitation.csv")
    parser.add_argument("--retrieved-at", help="Horodatage réel CDS ; sinon repris du snapshot empreinte présent dans raw")
    parser.add_argument("--work-directory", type=Path)
    args = parser.parse_args()

    raw = args.raw_directory.resolve()
    missing = [name for name in EXPECTED if not (raw / name).is_file()]
    if missing:
        raise SystemExit("Dossier raw incomplet : " + ", ".join(missing))
    inherited_at, inherited_version = _existing_retrieval(raw)
    retrieved_at = args.retrieved_at or inherited_at
    if not retrieved_at:
        raise SystemExit("retrieved_at introuvable : fournir --retrieved-at avec l'horodatage réel CDS")

    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    grid, request = request_parameters(LAT, LON)
    verified_at = _now()
    work = (args.work_directory or (raw.parent / "p6-overview-replay")).resolve()
    work.mkdir(parents=True, exist_ok=True)

    manifest = build_snapshot_manifest(
        raw,
        snapshot_id=f"SNAPSHOT-OVERVIEW-V1-{verified_at.replace(':', '').replace('-', '')}",
        tile_id=TILE_ID,
        latitude=LAT,
        longitude=LON,
        created_at=verified_at,
        retrieved_at=retrieved_at,
        grid_latitude=grid.latitude,
        grid_longitude=grid.longitude,
        request_parameters=request,
        dataset_version=inherited_version,
    )
    manifest_path = write_snapshot_manifest(raw, manifest)
    result = replay_snapshot(manifest_path, generated_at=verified_at)
    result_path = work / "climate-result.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    status, error = "pass", None
    try:
        assert_overview_equivalent(result["data"], golden)
    except AssertionError as exc:
        status, error = "fail", str(exc)

    report = {
        "status": status,
        "method": {"id": "climate-overview", "version": "1.0.0"},
        "verified_at": verified_at,
        "retrieved_at": retrieved_at,
        "numeric_tolerance": 0.0,
        "assets": [{"path": str(raw / name), "sha256": sha256_file(raw / name)} for name in EXPECTED],
        "snapshot": str(manifest_path),
        "result": str(result_path),
        "golden_master": str(GOLDEN),
        "legacy_approximate_extremes": "excluded_from_canonical_comparison",
    }
    if error:
        report["error"] = error
    report_path = work / "golden-replay-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if status == "pass":
        print("\nPASS — climate-overview P6 reproduit le golden master V1 à tolérance nulle.")
        return 0
    print("\nFAIL — climate-overview P6 diffère du golden master V1.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
