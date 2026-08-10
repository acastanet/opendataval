from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_water_service.renderer import (  # noqa: E402
    render_water_result_svg,
    render_water_through_year_svg,
    write_water_result_svg,
)

GOLDEN = REPO_ROOT / "poc" / "climat" / "bilan eau" / "output" / "water-through-year.json"


class RendererTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = json.loads(GOLDEN.read_text(encoding="utf-8"))

    def test_renderer_has_four_pedagogical_bands_and_monthly_deltas(self) -> None:
        svg = render_water_through_year_svg(self.data)

        self.assertEqual(svg.count('class="band-background"'), 4)
        self.assertEqual(svg.count('class="delta-zero"'), 4)
        self.assertEqual(svg.count('class="delta-bar"'), 48)

        for label in (
            "Précipitations",
            "Stock d’eau du sol modélisé",
            "Évapotranspiration modélisée",
            "Indice SPEI-3",
            "Écart 2016–2025 − 1996–2005",
        ):
            self.assertIn(label, svg)

    def test_periods_are_identified_by_colour_and_line_style(self) -> None:
        svg = render_water_through_year_svg(self.data)
        self.assertGreaterEqual(svg.count(">1996–2005<"), 4)
        self.assertGreaterEqual(svg.count(">2016–2025<"), 4)
        self.assertIn(".early-line{fill:none;stroke:#2166AC", svg)
        self.assertIn(".late-line{fill:none;stroke:#B2182B", svg)
        self.assertIn("stroke-dasharray:6 4", svg)
        self.assertIn("P25–P75", svg)

    def test_validated_summaries_are_preserved_without_inventing_evapotranspiration_summary(self) -> None:
        svg = render_water_through_year_svg(self.data)
        self.assertIn("9,2 % de moins", svg)
        self.assertIn("11,8 mm de moins", svg)
        self.assertIn("1,0 mois de moins / an", svg)
        self.assertNotIn("Évapotranspiration annuelle", svg)

    def test_spei_threshold_is_explicit(self) -> None:
        svg = render_water_through_year_svg(self.data)
        self.assertIn("Seuil des mois secs :", svg)
        self.assertIn("SPEI-3 &lt; −1", svg)
        self.assertIn('class="dry-threshold"', svg)

    def test_climate_result_wrapper_uses_data_without_mutation(self) -> None:
        result = {
            "method": {"id": "water-through-year", "version": "1.0.0"},
            "data": copy.deepcopy(self.data),
        }
        before = copy.deepcopy(result)
        self.assertEqual(render_water_result_svg(result), render_water_through_year_svg(self.data))
        self.assertEqual(result, before)

    def test_wrong_method_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            render_water_result_svg({
                "method": {"id": "thermal-seasons", "version": "1.0.0"},
                "data": self.data,
            })

    def test_writer_creates_current_svg(self) -> None:
        result = {
            "method": {"id": "water-through-year", "version": "1.0.0"},
            "data": self.data,
        }
        expected = render_water_result_svg(result)
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "water-through-year-v1-neutral.svg"
            write_water_result_svg(result, output)
            self.assertEqual(output.read_text(encoding="utf-8"), expected)


if __name__ == "__main__":
    unittest.main()
