from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
POC_ROOT = REPO_ROOT / "poc" / "climat" / "bilan eau"
for path in (SERVICE_SRC, POC_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from climate_water_service import WaterContext, WaterThroughYearInput, assert_water_equivalent, compute_water_through_year_data  # noqa: E402
from water_through_year.pipeline import compute as poc_compute  # noqa: E402


def synthetic_inputs() -> tuple[pd.DataFrame, pd.Series]:
    index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    month = index.month.to_numpy(dtype=float)
    year = index.year.to_numpy(dtype=float)
    seasonal = 1.0 + 0.35 * np.cos(2 * np.pi * (month - 1) / 12)
    warming = (year - 1991) / 34
    frame = pd.DataFrame(
        {
            "total_precipitation": 0.0026 * seasonal * (1 - 0.08 * warming),
            "volumetric_soil_water_layer_1": 0.31 + 0.05 * seasonal - 0.015 * warming,
            "volumetric_soil_water_layer_2": 0.34 + 0.04 * seasonal - 0.012 * warming,
            "volumetric_soil_water_layer_3": 0.38 + 0.025 * seasonal - 0.008 * warming,
            "total_evaporation": -0.0018 * (1.2 - 0.3 * np.cos(2 * np.pi * (month - 1) / 12)),
        },
        index=index,
    )
    spei = pd.Series(0.8 * np.sin(2 * np.pi * month / 12) - 0.25 * warming, index=index, name="spei3")
    return frame, spei


class ComputeEquivalenceTest(unittest.TestCase):
    def test_native_matches_poc_on_same_monthly_series(self) -> None:
        land, spei = synthetic_inputs()
        kwargs = dict(
            tile_id="ODV-WATER-TEST",
            lat=44.06462321251746,
            lon=3.682972784135697,
            representativity={"grid_lat": 44.1, "grid_lon": 3.7},
            dataset_version="test",
            retrieved_at="2026-08-10T00:00:00Z",
        )
        legacy = poc_compute(land, spei, era5_land_frequency="monthly_mean_daily", **kwargs)
        native = compute_water_through_year_data(
            WaterThroughYearInput(land, spei),
            context=WaterContext(
                tile_id=kwargs["tile_id"],
                latitude=kwargs["lat"],
                longitude=kwargs["lon"],
                land_grid_latitude=44.1,
                land_grid_longitude=3.7,
                drought_grid_latitude=44.0,
                drought_grid_longitude=3.75,
                dataset_version="test",
                retrieved_at=kwargs["retrieved_at"],
                generated_at="2026-08-10T00:00:01Z",
            ),
        )
        assert_water_equivalent(native, legacy)


if __name__ == "__main__":
    unittest.main()
