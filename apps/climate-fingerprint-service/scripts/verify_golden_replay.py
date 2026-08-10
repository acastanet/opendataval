from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
GOLDEN_MASTER = (
    REPO_ROOT
    / "packages"
    / "climate-contracts"
    / "tests"
    / "golden-masters"
    / "climate-fingerprint"
    / "v4"
    / "poc-output.json"
)

EXPECTED_FILES = (
    "era5-land.csv",
    "era5-land-precipitation.csv",
    "era5-land-u10.csv",
    "era5-land-v10.csv",
    "utci.csv",
    "spei3.nc",
)

LATITUDE = 44.06465392551458
LONGITUDE = 3.6829349237761435
TILE_ID = "GPD-44.064654-3.682935"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _environment() -> dict[str, str]:
    env = dict(os.environ)
    pythonpath = env.get("PYTHONPATH")
    env["PYTHONPATH"] = str(SERVICE_SRC) if not pythonpath else os.pathsep.join((str(SERVICE_SRC), pythonpath))
    return env


def _run_cli(*arguments: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "climate_fingerprint_service.snapshot_cli", *arguments],
        cwd=REPO_ROOT,
        env=_environment(),
        check=True,
    )


def _check_raw_directory(raw_directory: Path) -> None:
    missing = [name for name in EXPECTED_FILES if not (raw_directory / name).is_file()]
    if missing:
        raise SystemExit(
            "Dossier raw incomplet. Fichiers manquants :\n- " + "\n- ".join(missing)
        )


def verify(raw_directory: Path, *, retrieved_at: str, work_directory: Path) -> dict[str, object]:
    raw_directory = raw_directory.resolve()
    work_directory = work_directory.resolve()
    _check_raw_directory(raw_directory)
    work_directory.mkdir(parents=True, exist_ok=True)

    metadata_path = work_directory / "acquisition-metadata.json"
    result_path = work_directory / "climate-result.json"
    svg_path = work_directory / "climate-fingerprint-v4.svg"
    report_path = work_directory / "golden-replay-report.json"
    snapshot_path = raw_directory / "climate-snapshot.json"

    created_at = _utc_now()

    _run_cli(
        "metadata-template",
        "--latitude",
        str(LATITUDE),
        "--longitude",
        str(LONGITUDE),
        "--retrieved-at",
        retrieved_at,
        "--output",
        str(metadata_path),
    )
    _run_cli(
        "build",
        str(raw_directory),
        "--metadata",
        str(metadata_path),
        "--snapshot-id",
        f"SNAPSHOT-FINGERPRINT-GOLDEN-{created_at.replace(':', '').replace('-', '')}",
        "--tile-id",
        TILE_ID,
        "--latitude",
        str(LATITUDE),
        "--longitude",
        str(LONGITUDE),
        "--created-at",
        created_at,
    )
    _run_cli(
        "replay",
        str(snapshot_path),
        str(result_path),
        "--generated-at",
        created_at,
    )

    if str(SERVICE_SRC) not in sys.path:
        sys.path.insert(0, str(SERVICE_SRC))
    from climate_fingerprint_service import (
        assert_fingerprint_equivalent,
        write_fingerprint_result_svg,
    )

    result = json.loads(result_path.read_text(encoding="utf-8"))
    golden = json.loads(GOLDEN_MASTER.read_text(encoding="utf-8"))
    write_fingerprint_result_svg(result, svg_path)

    status = "pass"
    error: str | None = None
    try:
        assert_fingerprint_equivalent(result["data"], golden)
    except AssertionError as exc:
        status = "fail"
        error = str(exc)

    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    report: dict[str, object] = {
        "status": status,
        "method": {"id": "climate-fingerprint", "version": "4.0.0"},
        "retrieved_at": retrieved_at,
        "verified_at": created_at,
        "raw_directory": str(raw_directory),
        "snapshot": str(snapshot_path),
        "result": str(result_path),
        "svg": str(svg_path),
        "golden_master": str(GOLDEN_MASTER),
        "numeric_tolerance": 0.0,
        "assets": [
            {
                "asset_id": asset.get("asset_id"),
                "uri": asset.get("storage", {}).get("uri"),
                "sha256": asset.get("storage", {}).get("sha256"),
            }
            for asset in snapshot.get("assets", [])
        ],
    }
    if error:
        report["error"] = error

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Construit un ClimateSnapshot local, vérifie P6 et produit le SVG V4."
    )
    parser.add_argument("raw_directory", type=Path, help="Dossier contenant les six fichiers téléchargés")
    parser.add_argument(
        "--retrieved-at",
        required=True,
        help="Date réelle de récupération au format ISO 8601, par exemple 2026-08-10T03:20:00Z",
    )
    parser.add_argument(
        "--work-directory",
        type=Path,
        help="Dossier des résultats de vérification ; défaut : <raw>/../p6-replay",
    )
    args = parser.parse_args()

    raw_directory = args.raw_directory.resolve()
    work_directory = args.work_directory or (raw_directory.parent / "p6-replay")
    report = verify(raw_directory, retrieved_at=args.retrieved_at, work_directory=work_directory)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"] != "pass":
        print("\nFAIL — le recalcul P6 diffère du golden master V4.", file=sys.stderr)
        return 1
    print("\nPASS — le recalcul P6 reproduit le golden master V4 à tolérance nulle.")
    print(f"SVG — {report['svg']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
