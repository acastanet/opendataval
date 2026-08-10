from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_overview_service import ClimateOverviewInput, OverviewContext, compute_climate_overview_data  # noqa: E402


def synthetic_hourly() -> ClimateOverviewInput:
    index = pd.date_range("1991-01-01", "2020-12-31 23:00", freq="h", tz="UTC")
    doy = index.dayofyear.to_numpy(dtype=float)
    temp = 10.0 - 8.0 * np.cos(2 * np.pi * (doy - 15) / 365.25)
    # 1 mm/jour réparti uniformément sur 24 h.
    precip = np.full(len(index), 0.001 / 24.0)
    return ClimateOverviewInput(pd.Series(temp, index=index), pd.Series(precip, index=index))


class ComputeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = compute_climate_overview_data(
            synthetic_hourly(),
            context=OverviewContext(44.06462321251746, 3.682972784135697, 44.1, 3.7),
        )

    def test_reference_and_months(self) -> None:
        self.assertEqual(self.result["reference"], {"start": 1991, "end": 2020})
        self.assertEqual(len(self.result["monthly"]), 12)
        self.assertEqual(self.result["representativity"]["grid_cell_count"], 1)

    def test_precipitation_is_height_not_spatial_sum(self) -> None:
        annual = self.result["annual"]["precipitation_mm"]
        self.assertGreater(annual, 365.0)
        self.assertLess(annual, 366.1)

    def test_month_extrema_are_derived_from_climatology(self) -> None:
        self.assertEqual(self.result["annual"]["warmest_month"]["name"], "Juillet")
        self.assertEqual(self.result["annual"]["coldest_month"]["name"], "Janvier")


if __name__ == "__main__":
    unittest.main()
