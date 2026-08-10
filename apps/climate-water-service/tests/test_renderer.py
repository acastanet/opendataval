from __future__ import annotations

import json
import sys
import tempfile
import unittest
from copy import deepcopy
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
        cls.svg = render_water_through_year_svg(cls.data)

    def test_renderer_uses_four_main_bands_and_four_delta_strips(self) -> None:
        self.assertEqual(self.svg.count('class="band-background"'), 4)
        self.assertEqual(self.svg.count('class="delta-strip"'), 4)
        self.assertEqual(self.svg.count('class="delta-zero"'), 4)
        self.assertEqual(self.svg.count('class="delta-value"'), 48)
        self.assertEqual(self.svg.count('class="month"'), 48)
        self.assertEqual(self.svg.count('class="band-title"'), 4)
        for title in ("Précipitations", "Stock d’eau du sol modélisé", "Évapotranspiration", "Indice SPEI-3"):
            self.assertIn(f'>{title}<', self.svg)

    def test_each_band_has_a_local_semantic_legend(self) -> None:
        self.assertEqual(self.svg.count("1996–2005 · médiane mensuelle"), 4)
        self.assertEqual(self.svg.count("2016–2025 · médiane mensuelle"), 4)
        self.assertEqual(self.svg.count("Intervalle P25–P75"), 4)
        self.assertEqual(self.svg.count("Écart entre les deux décennies"), 4)
        self.assertEqual(self.svg.count("Seuil sec"), 1)
        self.assertNotIn("Référence 1991–2020", self.svg)
        self.assertNotIn("Décennie récente 2016–2025", self.svg)

    def test_renderer_uses_descriptive_language_and_explains_spei_threshold(self) -> None:
        self.assertIn("Le cycle saisonnier domine ; les écarts entre décennies sont localisés.", self.svg)
        self.assertIn("seuil des mois secs retenu : SPEI-3 &lt; −1", self.svg)
        for forbidden in ("tendance", "significatif", "dégradation", "assèchement"):
            self.assertNotIn(forbidden, self.svg.lower())

    def test_row_summaries_use_existing_comparisons(self) -> None:
        comparison = self.data["comparison"]
        self.assertEqual(comparison["annual_precip_change_pct"], -9.19)
        self.assertEqual(comparison["summer_soil_water_change_mm"], -11.78)
        self.assertEqual(comparison["dry_months_change"], -1.0)
        for label, value in (
            ("Pluie annuelle", "9,2 % de moins"),
            ("Stock estival", "11,8 mm de moins"),
            ("Mois secs SPEI-3", "1 mois de moins par an"),
        ):
            self.assertIn(f'>{label}<', self.svg)
            self.assertIn(f'>{value}<', self.svg)

    def test_climate_result_wrapper_uses_serialized_data_without_recalculation(self) -> None:
        result = {
            "method": {"id": "water-through-year", "version": "1.0.0"},
            "data": self.data,
        }
        self.assertEqual(render_water_result_svg(result), self.svg)

    def test_renderer_does_not_mutate_scientific_data(self) -> None:
        before = deepcopy(self.data)

        render_water_through_year_svg(self.data)

        self.assertEqual(self.data, before)

    def test_wrong_method_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            render_water_result_svg({
                "method": {"id": "thermal-seasons", "version": "1.0.0"},
                "data": self.data,
            })

    def test_writer_creates_the_new_svg(self) -> None:
        result = {
            "method": {"id": "water-through-year", "version": "1.0.0"},
            "data": self.data,
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "water-through-year-v1-neutral.svg"
            write_water_result_svg(result, output)
            self.assertEqual(output.read_text(encoding="utf-8"), self.svg)


if __name__ == "__main__":
    unittest.main()
