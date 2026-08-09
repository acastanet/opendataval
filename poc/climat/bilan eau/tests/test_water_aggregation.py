from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from water_through_year.aggregation import monthly_aggregate, summarize  # noqa: E402


class TestWaterAggregation(unittest.TestCase):
    def test_monthly_rules_sum_fluxes_and_mean_stock(self):
        index = pd.date_range("2020-01-01", "2020-01-31", freq="D", tz="UTC")
        frame = pd.DataFrame({"precipitation_mm": 2., "actual_evapotranspiration_mm": 1.,
                              "soil_water_0_100_mm": [100., 200.] * 15 + [150.]}, index=index)
        month = monthly_aggregate(frame).iloc[0]
        self.assertEqual(month["precipitation_mm"], 62)
        self.assertEqual(month["actual_evapotranspiration_mm"], 31)
        self.assertAlmostEqual(month["soil_water_0_100_mm"], 150)

    def test_decadal_percentiles(self):
        self.assertEqual(summarize([1, 2, 3, 4])["median"], 2.5)
        self.assertEqual(summarize([1, 2, 3, 4])["p25"], 1.75)
        self.assertEqual(summarize([1, 2, 3, 4])["p75"], 3.25)


if __name__ == "__main__":
    unittest.main()
