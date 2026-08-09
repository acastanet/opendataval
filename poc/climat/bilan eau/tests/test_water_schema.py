from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from water_through_year.schema import MONTH_KEYS, SCHEMA_VERSION, empty_document  # noqa: E402
from water_through_year.pipeline import compute  # noqa: E402


class TestWaterSchema(unittest.TestCase):
    def test_contract_contains_all_periods_and_metrics(self):
        doc = empty_document("TILE", 44., 3.)
        self.assertEqual(doc["schema_version"], SCHEMA_VERSION)
        self.assertEqual(doc["periods"]["reference"], [1991, 2020])
        self.assertEqual(set(doc["monthly"]), {"1996-2005", "2006-2015", "2016-2025"})
        self.assertEqual(tuple(doc["monthly"]["1996-2005"]), MONTH_KEYS)
        self.assertIn("actual_evapotranspiration_mm_p75", doc["monthly"]["1996-2005"]["jan"])

    def test_pipeline_keeps_intermediate_decade_and_comparisons(self):
        dates = pd.date_range("1991-01-01", "2025-12-31", freq="D", tz="UTC")
        late = (dates.year >= 2016).astype(float)
        land = pd.DataFrame({
            "total_precipitation": .002 + .0002 * late,
            "volumetric_soil_water_layer_1": .20 - .01 * late,
            "volumetric_soil_water_layer_2": .25 - .01 * late,
            "volumetric_soil_water_layer_3": .30 - .01 * late,
            "total_evaporation": -.0015,
        }, index=dates)
        months = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
        spei = pd.Series(np.where(months.year >= 2016, -1.2, -.2), index=months)
        doc = compute(land, spei, tile_id="TEST", lat=44., lon=3.)
        self.assertEqual(doc["monthly"]["2006-2015"]["jan"]["status"], "ok")
        self.assertIsNotNone(doc["comparison"]["annual_precip_change_pct"])
        self.assertIsNotNone(doc["comparison"]["summer_soil_water_change_mm"])
        self.assertIsNotNone(doc["comparison"]["dry_months_change"])


if __name__ == "__main__":
    unittest.main()
