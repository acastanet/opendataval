from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
POC_ROOT = REPO_ROOT / "poc" / "climat" / "general" / "climate" / "overview"
for path in (SERVICE_SRC, POC_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from climate_overview_service import (  # noqa: E402
    render_climate_overview_svg,
    render_overview_result_svg,
    write_overview_result_svg,
)
from render_svg import render_svg as poc_render  # noqa: E402

GOLDEN = POC_ROOT / "outputs" / "zone_test_utilisateur_climate-overview.json"


class RendererTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = json.loads(GOLDEN.read_text(encoding="utf-8"))

    def test_native_renderer_is_textually_identical_to_poc_renderer(self) -> None:
        self.assertEqual(
            render_climate_overview_svg(self.data["monthly"], self.data["annual"]),
            poc_render(self.data["monthly"], self.data["annual"]),
        )

    def test_climate_result_wrapper_uses_data_without_recalculation(self) -> None:
        result = {
            "method": {"id": "climate-overview", "version": "1.0.0"},
            "data": self.data,
        }
        self.assertEqual(
            render_overview_result_svg(result),
            poc_render(self.data["monthly"], self.data["annual"]),
        )

    def test_wrong_method_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            render_overview_result_svg({
                "method": {"id": "thermal-seasons", "version": "1.0.0"},
                "data": self.data,
            })

    def test_writer_creates_svg(self) -> None:
        result = {
            "method": {"id": "climate-overview", "version": "1.0.0"},
            "data": self.data,
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "climate-overview-v1-neutral.svg"
            write_overview_result_svg(result, output)
            self.assertEqual(
                output.read_text(encoding="utf-8"),
                poc_render(self.data["monthly"], self.data["annual"]),
            )


if __name__ == "__main__":
    unittest.main()
