from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from water_through_year.aggregation import soil_water_0_100_mm  # noqa: E402


class TestSoilWaterStock(unittest.TestCase):
    def test_weighted_0_to_100_cm_stock(self):
        result = soil_water_0_100_mm(pd.Series([.1]), pd.Series([.2]), pd.Series([.3]))
        self.assertAlmostEqual(result.iloc[0], 1000 * (.07 * .1 + .21 * .2 + .72 * .3))


if __name__ == "__main__":
    unittest.main()
