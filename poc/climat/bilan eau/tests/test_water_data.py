from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from water_through_year.data import prepare_land_daily  # noqa: E402


class TestWaterData(unittest.TestCase):
    def test_precipitation_m_is_converted_to_mm(self):
        frame = pd.DataFrame({
            "total_precipitation": [0.012], "volumetric_soil_water_layer_1": [.2],
            "volumetric_soil_water_layer_2": [.2], "volumetric_soil_water_layer_3": [.2],
            "total_evaporation": [-.003],
        }, index=pd.to_datetime(["2020-01-01"], utc=True))
        prepared = prepare_land_daily(frame)
        self.assertEqual(prepared.iloc[0]["precipitation_mm"], 12)

    def test_evaporation_display_is_positive(self):
        frame = pd.DataFrame({
            "total_precipitation": [0], "volumetric_soil_water_layer_1": [.2],
            "volumetric_soil_water_layer_2": [.2], "volumetric_soil_water_layer_3": [.2],
            "total_evaporation": [-.003],
        }, index=pd.to_datetime(["2020-01-01"], utc=True))
        self.assertEqual(prepare_land_daily(frame).iloc[0]["actual_evapotranspiration_mm"], 3)


if __name__ == "__main__":
    unittest.main()
