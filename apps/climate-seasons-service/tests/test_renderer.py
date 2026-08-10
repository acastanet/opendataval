from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
POC_ROOT = REPO_ROOT / "poc" / "climat" / "saisons"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service.renderer import (  # noqa: E402
    ThermalSeasonsRenderError,
    render_thermal_seasons_result_svg,
    render_thermal_seasons_svg,
)

FIXTURE = POC_ROOT / "tests" / "fixtures" / "thermal-seasons-fixture.json"


def _result(data: dict) -> dict:
    return {
        "product": {"id": "thermal-seasons", "title": "Les saisons se déplacent"},
        "method": {"id": "thermal-seasons", "version": "1.0.0"},
        "data": data,
    }


class ThermalSeasonsRendererTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_renderer_shows_only_computed_thermal_calendars(self) -> None:
        svg = render_thermal_seasons_svg(self.golden)
        self.assertIn("Deux calendriers thermiques locaux comparés", svg)
        self.assertIn("1996–2005", svg)
        self.assertIn("2016–2025", svg)
        self.assertIn("JAN", svg)
        self.assertIn("DÉC", svg)
        self.assertNotIn("ts-reference-separator", svg)

    def test_three_pedagogical_summaries_are_present(self) -> None:
        svg = render_thermal_seasons_svg(self.golden)
        self.assertIn("Début été : 18 j plus tôt", svg)
        self.assertIn("Début automne : 15 j plus tard", svg)
        self.assertIn("Été thermique : +29 j", svg)
        self.assertIn("frontières médianes · zones = P25–P75", svg)

    def test_climate_result_wrapper_does_not_mutate_input(self) -> None:
        result = _result(copy.deepcopy(self.golden))
        before = copy.deepcopy(result)
        svg = render_thermal_seasons_result_svg(result)
        self.assertEqual(result, before)
        self.assertIn('fill="#C5C4C1"', svg)

    def test_renderer_rejects_wrong_method(self) -> None:
        broken = copy.deepcopy(_result(self.golden))
        broken["method"]["version"] = "2.0.0"
        with self.assertRaises(ThermalSeasonsRenderError):
            render_thermal_seasons_result_svg(broken)


if __name__ == "__main__":
    unittest.main()
