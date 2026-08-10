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


def _native_shape_payload() -> dict:
    payload = json.loads(EXAMPLE_JSON.read_text(encoding="utf-8"))
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
    def test_neutral_renderer_keeps_six_scientific_rows_without_global_score(self) -> None:
        payload = _native_shape_payload()
        svg = render_fingerprint_result_svg(_result(payload), theme="neutral")
        self.assertIn('fill="#C5C4C1"', svg)
        self.assertIn("six indicateurs, sans score global", svg)
        self.assertNotIn("Empreinte bilan", svg)
        self.assertNotIn("Indice signé", svg)
        labels = [row.get("label") for row in payload.get("rows", []) if isinstance(row, dict)]
        self.assertEqual(len(labels), 6)
        for label in labels:
            self.assertIsInstance(label, str)
            self.assertIn(label, svg)

    def test_comparison_values_are_formatted_by_renderer_in_french(self) -> None:
        svg = render_fingerprint_result_svg(_result(_native_shape_payload()), theme="neutral")
        self.assertIn("+1,12 °C", svg)
        self.assertIn("+1,62 °C UTCI", svg)
        self.assertIn("1996–2005 et 2016–2025", svg)
        self.assertNotIn("+1.12 °C", svg)

    def test_renderer_uses_only_scientific_percentile_for_color_legend(self) -> None:
        svg = render_fingerprint_result_svg(_result(_native_shape_payload()), theme="neutral")
        self.assertIn("Position dans la distribution 1991–2020", svg)
        self.assertIn("couleur issue du percentile calculé", svg)
        self.assertNotIn("−3 σ", svg)
        self.assertNotIn("+3 σ", svg)

    def test_public_wind_label_does_not_imply_gust_or_storm(self) -> None:
        svg = render_fingerprint_result_svg(_result(_native_shape_payload()), theme="neutral")
        self.assertIn("Vent fort · vent horaire", svg)
        self.assertNotIn("rafale", svg.lower())
        self.assertNotIn("tempête", svg.lower())

    def test_renderer_does_not_mutate_climate_result(self) -> None:
        result = _result(_native_shape_payload())
        before = copy.deepcopy(result)
        render_fingerprint_result_svg(result, theme="neutral")
        self.assertEqual(result, before)

    def test_renderer_rejects_wrong_method(self) -> None:
        result = _result(_native_shape_payload())
        broken = copy.deepcopy(result)
        broken["method"]["version"] = "5.0.0"
        with self.assertRaises(FingerprintRenderError):
            render_fingerprint_result_svg(broken)


if __name__ == "__main__":
    unittest.main()
