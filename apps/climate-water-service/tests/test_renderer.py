from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
POC_ROOT = REPO_ROOT / "poc" / "climat" / "bilan eau"
for path in (SERVICE_SRC, POC_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from climate_water_service import (  # noqa: E402
    render_water_result_svg,
    render_water_through_year_svg,
    write_water_result_svg,
)
from water_through_year.render_svg import render_water_through_year_svg as poc_render  # noqa: E402

GOLDEN = POC_ROOT / "output" / "water-through-year.json"


class RendererTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = json.loads(GOLDEN.read_text(encoding="utf-8"))

    def test_native_renderer_is_textually_identical_to_poc_renderer(self) -> None:
        self.assertEqual(render_water_through_year_svg(self.data), poc_render(self.data))

    def test_climate_result_wrapper_uses_data_without_recalculation(self) -> None:
        result = {
            "method": {"id": "water-through-year", "version": "1.0.0"},
            "data": self.data,
        }
        self.assertEqual(render_water_result_svg(result), poc_render(self.data))

    def test_wrong_method_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            render_water_result_svg({
                "method": {"id": "thermal-seasons", "version": "1.0.0"},
                "data": self.data,
            })

    def test_writer_creates_svg(self) -> None:
        result = {
            "method": {"id": "water-through-year", "version": "1.0.0"},
            "data": self.data,
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "water-through-year-v1-neutral.svg"
            write_water_result_svg(result, output)
            self.assertEqual(output.read_text(encoding="utf-8"), poc_render(self.data))


if __name__ == "__main__":
    unittest.main()
