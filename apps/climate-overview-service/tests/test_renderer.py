from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
POC_ROOT = REPO_ROOT / "poc" / "climat" / "general" / "climate" / "overview"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_overview_service import (  # noqa: E402
    render_climate_overview_svg,
    render_overview_result_svg,
    write_overview_result_svg,
)

GOLDEN = POC_ROOT / "outputs" / "zone_test_utilisateur_climate-overview.json"


def _result(data: dict) -> dict:
    return {
        "method": {"id": "climate-overview", "version": "1.0.0"},
        "data": data,
    }


class RendererTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = json.loads(GOLDEN.read_text(encoding="utf-8"))

    def test_renderer_exposes_pedagogical_structure(self) -> None:
        svg = render_climate_overview_svg(self.data["monthly"], self.data["annual"])
        self.assertIn("Température (°C)", svg)
        self.assertIn("Précipitations (mm/mois)", svg)
        self.assertIn("Température moyenne · zone P10–P90", svg)
        self.assertIn("Précipitations moyennes", svg)
        self.assertIn("moyenne annuelle", svg)
        self.assertIn("sur l’année", svg)
        self.assertIn("JAN", svg)
        self.assertIn("DÉC", svg)

    def test_climate_result_wrapper_does_not_mutate_input(self) -> None:
        result = _result(copy.deepcopy(self.data))
        before = copy.deepcopy(result)
        svg = render_overview_result_svg(result)
        self.assertEqual(result, before)
        self.assertIn("Le climat de la zone", svg)

    def test_wrong_method_is_rejected(self) -> None:
        broken = _result(copy.deepcopy(self.data))
        broken["method"] = {"id": "thermal-seasons", "version": "1.0.0"}
        with self.assertRaises(ValueError):
            render_overview_result_svg(broken)

    def test_writer_creates_svg(self) -> None:
        result = _result(copy.deepcopy(self.data))
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "climate-overview-v1-neutral.svg"
            write_overview_result_svg(result, output)
            rendered = output.read_text(encoding="utf-8")
            self.assertIn("<svg", rendered)
            self.assertIn("Référence 1991–2020", rendered)


if __name__ == "__main__":
    unittest.main()
