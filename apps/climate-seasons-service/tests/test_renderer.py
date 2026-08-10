from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
POC_ROOT = REPO_ROOT / "poc" / "climat" / "saisons"
for path in (SERVICE_SRC, POC_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from climate_seasons_service.renderer import (  # noqa: E402
    ThermalSeasonsRenderError,
    render_thermal_seasons_result_svg,
    render_thermal_seasons_svg,
)
from thermal_seasons.render_svg import render_thermal_seasons_svg as poc_render  # noqa: E402

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

    def test_native_renderer_matches_poc_v5_exactly(self) -> None:
        expected = poc_render(self.golden)
        generated = render_thermal_seasons_svg(self.golden)
        self.assertEqual(generated, expected)

    def test_climate_result_wrapper_matches_poc_v5_exactly(self) -> None:
        expected = poc_render(self.golden)
        generated = render_thermal_seasons_result_svg(_result(self.golden))
        self.assertEqual(generated, expected)
        self.assertIn('fill="#C5C4C1"', generated)
        self.assertIn("Été thermique", generated)
        self.assertIn("+29 jours", generated)

    def test_renderer_rejects_wrong_method(self) -> None:
        broken = copy.deepcopy(_result(self.golden))
        broken["method"]["version"] = "2.0.0"
        with self.assertRaises(ThermalSeasonsRenderError):
            render_thermal_seasons_result_svg(broken)


if __name__ == "__main__":
    unittest.main()
