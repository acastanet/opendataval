from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
from jsonschema import Draft202012Validator, FormatChecker, RefResolver

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_fingerprint_service.compute import FingerprintSeriesInput, compute_fingerprint_data  # noqa: E402
from climate_fingerprint_service.equivalence import assert_fingerprint_equivalent  # noqa: E402
from climate_fingerprint_service.snapshot import (  # noqa: E402
    ASSET_SPECS,
    SnapshotError,
    SnapshotIntegrityError,
    build_snapshot_manifest,
    replay_snapshot,
    verify_snapshot_assets,
    write_snapshot_manifest,
)


def _series() -> FingerprintSeriesInput:
    daily_index = pd.date_range("1991-01-01", "2025-12-31", freq="1D", tz="UTC")
    ordinal = (daily_index.year - 1991).to_numpy(dtype=float)
    temperature = pd.Series(8 + ordinal * 0.08 + np.sin(daily_index.dayofyear / 30), index=daily_index)
    utci = pd.Series(18 + ordinal * 0.05 + np.sin(daily_index.dayofyear / 20) * 8, index=daily_index)
    precipitation = pd.Series(
        np.where(daily_index.dayofyear % 9 == 0, 0.012, 0.0008), index=daily_index
    )
    wind = pd.Series(
        4 + np.where(daily_index.dayofyear % 17 == 0, 12, 0), index=daily_index
    )
    zero = pd.Series(0.0, index=daily_index)
    monthly_index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    spei = pd.Series(
        np.sin(monthly_index.month / 2) - (monthly_index.year - 1991) * 0.01,
        index=monthly_index,
    )
    return FingerprintSeriesInput(
        temperature_c=temperature,
        utci_c=utci,
        precipitation_m=precipitation,
        spei3=spei,
        wind_u_mps=wind,
        wind_v_mps=zero,
    )


def _write_csv(path: Path, series: pd.Series, column: str) -> None:
    frame = pd.DataFrame({"valid_time": series.index, column: series.to_numpy()})
    frame.to_csv(path, index=False, float_format="%.17g")


def _write_assets(directory: Path, series: FingerprintSeriesInput) -> None:
    _write_csv(directory / "era5-land.csv", series.temperature_c + 273.15, "t2m")
    _write_csv(directory / "era5-land-precipitation.csv", series.precipitation_m, "tp")
    _write_csv(directory / "era5-land-u10.csv", series.wind_u_mps, "u10")
    _write_csv(directory / "era5-land-v10.csv", series.wind_v_mps, "v10")
    _write_csv(directory / "utci.csv", series.utci_c + 273.15, "utci")

    naive_time = series.spei3.index.tz_convert(None)
    dataset = xr.Dataset(
        {
            "spei": ("time", series.spei3.to_numpy(dtype=float)),
        },
        coords={"time": naive_time.to_numpy()},
    )
    dataset.to_netcdf(directory / "spei3.nc")


def _metadata() -> dict[str, dict[str, object]]:
    metadata: dict[str, dict[str, object]] = {}
    for spec in ASSET_SPECS:
        is_land = spec.dataset_registry_id == "era5-land-timeseries"
        metadata[spec.asset_id] = {
            "retrieved_at": "2026-08-09T20:00:00Z",
            "dataset_version": f"fixture-{spec.asset_id}",
            "period_start": "1991-01-01",
            "period_end": "2025-12-31",
            "request_parameters": {
                "variable": list(spec.variables),
                "format": "csv" if spec.reader == "csv" else "netcdf",
                "test_fixture": True,
            },
            "represented_spatial": {
                "lat": 44.1 if is_land else 44.0,
                "lon": 3.6 if is_land else 3.75,
                "resolution_degrees": 0.1 if is_land else 0.25,
            },
            "quality_status": "valid",
        }
    return metadata


def _validate_schema(instance: dict, schema_name: str) -> list[str]:
    schema_path = REPO_ROOT / "packages" / "climate-contracts" / "schemas" / schema_name
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    resolver = RefResolver(base_uri=schema_path.parent.as_uri() + "/", referrer=schema)
    validator = Draft202012Validator(schema, resolver=resolver, format_checker=FormatChecker())
    return [error.message for error in validator.iter_errors(instance)]


class SnapshotReplayTest(unittest.TestCase):
    def test_snapshot_manifest_is_schema_valid_and_replays_native_result(self) -> None:
        series = _series()
        with tempfile.TemporaryDirectory(prefix="odv-fingerprint-snapshot-") as temporary:
            directory = Path(temporary)
            _write_assets(directory, series)
            manifest = build_snapshot_manifest(
                directory,
                snapshot_id="SNAPSHOT-TEST-FINGERPRINT-V4",
                tile_id="ODV-TEST",
                latitude=44.081192,
                longitude=3.641467,
                created_at="2026-08-09T20:05:00Z",
                acquisition_metadata=_metadata(),
            )
            manifest_path = write_snapshot_manifest(directory, manifest)

            self.assertEqual(_validate_schema(manifest, "climate-snapshot.schema.json"), [])
            verified = verify_snapshot_assets(manifest, manifest_path)
            self.assertEqual(set(verified), {spec.asset_id for spec in ASSET_SPECS})

            replayed = replay_snapshot(
                manifest_path,
                generated_at="2026-08-09T20:10:00Z",
            )
            direct = compute_fingerprint_data(
                series,
                tile_id="ODV-TEST",
                latitude=44.081192,
                longitude=3.641467,
            )

            assert_fingerprint_equivalent(replayed["data"], direct)
            self.assertEqual(replayed["snapshot_id"], "SNAPSHOT-TEST-FINGERPRINT-V4")
            self.assertEqual(len(replayed["signals"]), 6)
            self.assertEqual(_validate_schema(replayed, "climate-result.schema.json"), [])

            represented_assets = replayed["representativity"]["assets"]
            self.assertEqual(set(represented_assets), {spec.asset_id for spec in ASSET_SPECS})

            provenance_assets = replayed["provenance"]["source_assets"]
            self.assertEqual(set(provenance_assets), {spec.asset_id for spec in ASSET_SPECS})
            for spec in ASSET_SPECS:
                provenance = provenance_assets[spec.asset_id]
                self.assertEqual(provenance["retrieved_at"], "2026-08-09T20:00:00Z")
                self.assertEqual(provenance["dataset_version"], f"fixture-{spec.asset_id}")
                self.assertTrue(provenance["request_parameters"]["test_fixture"])

            declared_asset_ids = {
                asset_id
                for dataset in replayed["datasets"]
                for asset_id in dataset.get("asset_ids", [])
            }
            self.assertEqual(declared_asset_ids, {spec.asset_id for spec in ASSET_SPECS})

    def test_tampered_asset_is_rejected_before_replay(self) -> None:
        series = _series()
        with tempfile.TemporaryDirectory(prefix="odv-fingerprint-snapshot-") as temporary:
            directory = Path(temporary)
            _write_assets(directory, series)
            manifest = build_snapshot_manifest(
                directory,
                snapshot_id="SNAPSHOT-TAMPER",
                tile_id="ODV-TEST",
                latitude=44.0,
                longitude=3.0,
                created_at="2026-08-09T20:05:00Z",
                acquisition_metadata=_metadata(),
            )
            manifest_path = write_snapshot_manifest(directory, manifest)
            with (directory / "era5-land.csv").open("a", encoding="utf-8") as handle:
                handle.write("\n")

            with self.assertRaises(SnapshotIntegrityError):
                replay_snapshot(manifest_path)

    def test_builder_refuses_missing_retrieval_metadata(self) -> None:
        series = _series()
        with tempfile.TemporaryDirectory(prefix="odv-fingerprint-snapshot-") as temporary:
            directory = Path(temporary)
            _write_assets(directory, series)
            metadata = _metadata()
            metadata.pop("era5-heat-utci")

            with self.assertRaises(SnapshotError):
                build_snapshot_manifest(
                    directory,
                    snapshot_id="SNAPSHOT-MISSING-META",
                    tile_id="ODV-TEST",
                    latitude=44.0,
                    longitude=3.0,
                    created_at="2026-08-09T20:05:00Z",
                    acquisition_metadata=metadata,
                )


if __name__ == "__main__":
    unittest.main()
