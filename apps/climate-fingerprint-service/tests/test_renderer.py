from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_fingerprint_service import (  # noqa: E402
    FingerprintRenderError,
    render_fingerprint_result_svg,
)

EXAMPLE_JSON = (
    REPO_ROOT
    / "poc"
    / "climat"
    / "empreinte-climatique"
    / "example"
    / "climate-fingerprint-v4.json"
)
EXAMPLE_SVG = EXAMPLE_JSON.with_suffix(".svg")


def _native_shape_payload() -> dict:
    payload = json.loads(EXAMPLE_JSON.read_text(encoding="utf-8"))
    # Ces champs appartiennent au POC/rendu historique et ne sont pas présents
    # dans le payload scientifique P6. Le renderer ne doit pas en dépendre.
    payload.pop("summary", None)
    payload.pop("provenance", None)
    for row in payload.get("rows", []):
        if isinstance(row, dict):
            row.pop("classes", None)
            row.pop("palette", None)
    return payload


def _result(payload: dict) -> dict:
    return {
        "product": {"id": "climate-fingerprint", "title": "L'empreinte climatique du lieu"},
        "method": {"id": "climate-fingerprint", "version": "4.0.0"},
        "data": payload,
    }


class FingerprintRendererTest(unittest.TestCase):
    def test_native_climate_result_reproduces_v4_svg_exactly(self) -> None:
        generated = render_fingerprint_result_svg(_result(_native_shape_payload()))
        expected = EXAMPLE_SVG.read_text(encoding="utf-8").replace("\r\n", "\n").rstrip("\n")
        self.assertEqual(generated, expected)

    def test_neutral_theme_changes_only_presentation(self) -> None:
        result = _result(_native_shape_payload())
        light = render_fingerprint_result_svg(result, theme="light")
        neutral = render_fingerprint_result_svg(result, theme="neutral")
        self.assertIn('fill="#FAFAF7"', light)
        self.assertIn('fill="#C5C4C1"', neutral)
        self.assertIn("+1.12 °C", neutral)
        self.assertIn("+1.62 °C UTCI", neutral)

    def test_renderer_rejects_wrong_method(self) -> None:
        result = _result(_native_shape_payload())
        broken = copy.deepcopy(result)
        broken["method"]["version"] = "5.0.0"
        with self.assertRaises(FingerprintRenderError):
            render_fingerprint_result_svg(broken)


if __name__ == "__main__":
    unittest.main()
