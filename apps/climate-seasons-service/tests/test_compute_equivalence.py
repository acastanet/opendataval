from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
POC_ROOT = REPO_ROOT / "poc" / "climat" / "saisons"
for path in (SERVICE_SRC, POC_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from climate_seasons_service import (  # noqa: E402
    ThermalSeasonsContext,
    ThermalSeasonsInput,
    assert_thermal_seasons_equivalent,
    compute_thermal_seasons_data,
)
from thermal_seasons.pipeline import compute as poc_compute  # noqa: E402


def synthetic_hourly() -> pd.Series:
    index = pd.date_range("1991-01-01", "2025-12-31 23:00", freq="h", tz="UTC")
    day = index.dayofyear.to_numpy(dtype=float)
    year = index.year.to_numpy(dtype=float)
    # Cycle annuel lisse, légèrement réchauffé au fil des années. Le bruit
    # diurne reste déterministe et ne change pas la moyenne journalière.
    seasonal = 10.0 - 10.0 * np.cos(2.0 * np.pi * (day - 15.0) / 365.0)
    trend = (year - 1991.0) * 0.03
    diurnal = 1.5 * np.sin(2.0 * np.pi * index.hour.to_numpy(dtype=float) / 24.0)
    return pd.Series(seasonal + trend + diurnal, index=index)


class ComputeEquivalenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temperature = synthetic_hourly()

    def test_native_matches_poc_on_same_hourly_series(self) -> None:
        legacy = poc_compute(
            self.temperature,
            tile_id="ODV-TEST",
            lat=44.06465392551458,
            lon=3.6829349237761435,
            grid_lat=44.1,
            grid_lon=3.7,
            retrieved_at="2026-08-10T00:00:00Z",
            credentials_source="test",
        )
        native = compute_thermal_seasons_data(
            ThermalSeasonsInput(self.temperature),
            context=ThermalSeasonsContext(
                tile_id="ODV-TEST",
                latitude=44.06465392551458,
                longitude=3.6829349237761435,
                grid_latitude=44.1,
                grid_longitude=3.7,
                retrieved_at="2026-08-10T00:00:00Z",
                credentials_source="test",
                generated_at="2026-08-10T00:00:01Z",
            ),
        )
        assert_thermal_seasons_equivalent(native, legacy)

    def test_reference_year_with_insufficient_coverage_is_rejected(self) -> None:
        temperature = self.temperature[self.temperature.index.year != 2000]
        with self.assertRaisesRegex(ValueError, "Référence 1991–2020 incomplète"):
            compute_thermal_seasons_data(
                ThermalSeasonsInput(temperature),
                context=ThermalSeasonsContext(
                    tile_id="ODV-TEST",
                    latitude=44.0,
                    longitude=3.0,
                ),
            )


if __name__ == "__main__":
    unittest.main()
