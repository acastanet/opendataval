from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from water_through_year.render_svg import render_water_through_year_svg  # noqa: E402
from water_through_year.schema import empty_document  # noqa: E402


class TestWaterSvg(unittest.TestCase):
    def test_svg_uses_document_values_and_required_visual_language(self):
        doc = empty_document("TILE", 44., 3.)
        for period in ("1996-2005", "2016-2025"):
            for month in doc["monthly"][period].values():
                month.update({"precipitation_mm_median": 40., "soil_water_0_100_mm_median": 180.,
                              "soil_water_reference_percentile_median": 50.,
                              "actual_evapotranspiration_mm_median": 50., "spei3_median": -.7})
        svg = render_water_through_year_svg(doc)
        self.assertIn("L’eau au fil de l’année", svg)
        self.assertIn("1996–2005", svg)
        self.assertIn("2016–2025", svg)
        self.assertIn("#C5C4C1", svg)
        self.assertIn("#2166AC", svg)
        self.assertIn("soft-shadow", svg)
        self.assertIn("Sources : ERA5-Land / ERA5-Drought", svg)


if __name__ == "__main__":
    unittest.main()
