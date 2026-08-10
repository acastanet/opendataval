from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_water_service import (  # noqa: E402
    SnapshotIntegrityError,
    WaterContext,
    WaterThroughYearInput,
    assert_water_equivalent,
    build_snapshot_manifest,
    compute_water_through_year_data,
    replay_snapshot,
    request_parameters,
    verify_snapshot_assets,
    write_snapshot_manifest,
)


def inputs() -> tuple[pd.DataFrame, pd.Series]:
    index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    month = index.month.to_numpy(dtype=float)
    year = index.year.to_numpy(dtype=float)
    trend = (year - 1991) / 34
    frame = pd.DataFrame({
        "total_precipitation": 0.0027 * (1.15 + 0.2 * np.cos(month)) * (1 - 0.07 * trend),
        "volumetric_soil_water_layer_1": 0.35 + 0.03 * np.cos(month) - 0.02 * trend,
        "volumetric_soil_water_layer_2": 0.37 + 0.02 * np.cos(month) - 0.015 * trend,
        "volumetric_soil_water_layer_3": 0.40 + 0.015 * np.cos(month) - 0.01 * trend,
        "total_evaporation": -0.0016 * (1.0 + 0.25 * np.sin(month)),
    }, index=index)
    spei = pd.Series(0.7 * np.sin(month) - 0.2 * trend, index=index, name="spei3")
    return frame, spei


def write_assets(raw: Path) -> tuple[pd.DataFrame, pd.Series]:
    land, spei = inputs()
    times = land.index.tz_convert(None).to_numpy()
    dataset = xr.Dataset({name: ("valid_time", values.to_numpy()) for name, values in land.items()}, coords={"valid_time": times})
    dataset.to_netcdf(raw / "era5-land-monthly.nc", engine="scipy")
    xr.Dataset({"spei3": ("valid_time", spei.to_numpy())}, coords={"valid_time": times}).to_netcdf(
        raw / "era5-drought-spei3.nc", engine="scipy"
    )
    return land, spei


class SnapshotReplayTest(unittest.TestCase):
    def test_snapshot_replay_matches_direct_compute_and_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            raw = Path(temporary)
            land, spei = write_assets(raw)
            land_grid, drought_grid, land_request, drought_request = request_parameters(44.06462321251746, 3.682972784135697)
            manifest = build_snapshot_manifest(
                raw,
                snapshot_id="SNAPSHOT-WATER-TEST",
                tile_id="ODV-WATER-TEST",
                latitude=44.06462321251746,
                longitude=3.682972784135697,
                created_at="2026-08-10T00:00:00Z",
                retrieved_at="2026-08-10T00:00:00Z",
                land_grid_latitude=land_grid.latitude,
                land_grid_longitude=land_grid.longitude,
                drought_grid_latitude=drought_grid.latitude,
                drought_grid_longitude=drought_grid.longitude,
                land_request_parameters=land_request,
                drought_request_parameters=drought_request,
                dataset_version="test",
            )
            schema = json.loads((REPO_ROOT / "packages" / "climate-contracts" / "schemas" / "climate-snapshot.schema.json").read_text(encoding="utf-8"))
            Draft202012Validator(schema).validate(manifest)
            manifest_path = write_snapshot_manifest(raw, manifest)
            verify_snapshot_assets(manifest, manifest_path)
            result = replay_snapshot(manifest_path, generated_at="2026-08-10T00:00:01Z")
            direct = compute_water_through_year_data(
                WaterThroughYearInput(land, spei),
                context=WaterContext(
                    tile_id="ODV-WATER-TEST",
                    latitude=44.06462321251746,
                    longitude=3.682972784135697,
                    land_grid_latitude=land_grid.latitude,
                    land_grid_longitude=land_grid.longitude,
                    drought_grid_latitude=drought_grid.latitude,
                    drought_grid_longitude=drought_grid.longitude,
                    retrieved_at="2026-08-10T00:00:00Z",
                    dataset_version="test",
                    generated_at="2026-08-10T00:00:01Z",
                ),
            )
            assert_water_equivalent(result["data"], direct)
            self.assertEqual(len(result["signals"]), 3)

    def test_modified_asset_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            raw = Path(temporary)
            write_assets(raw)
            land_grid, drought_grid, land_request, drought_request = request_parameters(44.0, 3.0)
            manifest = build_snapshot_manifest(
                raw,
                snapshot_id="SNAPSHOT-WATER-HASH",
                tile_id="ODV-WATER-HASH",
                latitude=44.0,
                longitude=3.0,
                created_at="2026-08-10T00:00:00Z",
                retrieved_at="2026-08-10T00:00:00Z",
                land_grid_latitude=land_grid.latitude,
                land_grid_longitude=land_grid.longitude,
                drought_grid_latitude=drought_grid.latitude,
                drought_grid_longitude=drought_grid.longitude,
                land_request_parameters=land_request,
                drought_request_parameters=drought_request,
            )
            manifest_path = write_snapshot_manifest(raw, manifest)
            with (raw / "era5-land-monthly.nc").open("ab") as handle:
                handle.write(b"tampered")
            with self.assertRaises(SnapshotIntegrityError):
                verify_snapshot_assets(manifest, manifest_path)


if __name__ == "__main__":
    unittest.main()
