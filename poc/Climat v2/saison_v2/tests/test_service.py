"""Tests sans réseau du microservice de cadrans."""

from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

from service.collector import CoordinatesError, nearest_grid_point, validate_coordinates
from service.generator import ROOT, WheelBundle, _png_dimensions, _render_svg
from service.main import app
from service.validation import TechnicalValidationError, validate_result, validate_temperature_series


class CoordinatesTest(unittest.TestCase):
    def test_point_is_rounded_to_era5_land_grid(self) -> None:
        self.assertEqual(nearest_grid_point(44.20485692495915, 3.5139766462697613), (44.2, 3.5))

    def test_out_of_range_coordinates_are_rejected(self) -> None:
        with self.assertRaises(CoordinatesError):
            validate_coordinates(91.0, 3.5)
        with self.assertRaises(CoordinatesError):
            validate_coordinates(44.2, -181.0)


class TechnicalValidationTest(unittest.TestCase):
    def test_incomplete_temperature_series_is_rejected(self) -> None:
        series = pd.Series([12.0], index=pd.date_range("1991-01-01", periods=1, tz="UTC"))
        with self.assertRaisesRegex(TechnicalValidationError, "1991–2025"):
            validate_temperature_series(series)

    def test_incoherent_boundaries_are_rejected(self) -> None:
        result = json.loads(
            (ROOT / "output" / "thermal-seasons-v4-replay.json").read_text(encoding="utf-8")
        )
        invalid = deepcopy(result)
        invalid["data"]["decades"]["1996-2005"]["canonical_boundaries"]["summer_start"] = 1.0
        with self.assertRaisesRegex(TechnicalValidationError, "incohérentes"):
            validate_result(invalid)


class ServiceRenderTest(unittest.TestCase):
    def test_png_fallback_reads_svg_canvas_dimensions(self) -> None:
        self.assertEqual(_png_dimensions('<svg viewBox="0 0 972 1078"></svg>'), (972, 1078))

    def test_service_svg_is_static_and_self_contained(self) -> None:
        result = json.loads(
            (ROOT / "output" / "thermal-seasons-v4-replay.json").read_text(encoding="utf-8")
        )
        svg = _render_svg(result, ROOT / "wheel-config.json")
        self.assertIn("Point GPS", svg)
        self.assertIn("@font-face", svg)
        self.assertIn("font/ttf;base64,", svg)
        self.assertIn("font-family:'Inter'", svg)
        self.assertNotIn("@import", svg)
        self.assertNotIn("@keyframes", svg)
        self.assertNotIn("wheel-animated", svg)

    def test_service_svg_discloses_a_non_valid_quality_status(self) -> None:
        result = json.loads(
            (ROOT / "output" / "thermal-seasons-v4-replay.json").read_text(encoding="utf-8")
        )
        result["quality"]["status"] = "insufficient"
        svg = _render_svg(result, ROOT / "wheel-config.json")
        self.assertIn("interprétation prudente", svg)

    def test_service_svg_uses_and_escapes_the_custom_title(self) -> None:
        result = json.loads(
            (ROOT / "output" / "thermal-seasons-v4-replay.json").read_text(encoding="utf-8")
        )
        svg = _render_svg(result, ROOT / "wheel-config.json", "Mont <Aigoual> & vallée")
        self.assertIn("Mont &lt;Aigoual&gt; &amp; vallée", svg)
        self.assertNotIn(">Point GPS<", svg)


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.svg = root / "wheel.svg"
        self.png = root / "wheel.png"
        self.result = root / "result.json"
        self.svg.write_text('<svg xmlns="http://www.w3.org/2000/svg"></svg>', encoding="utf-8")
        self.png.write_bytes(b"\x89PNG\r\n\x1a\n")
        self.result.write_text(json.dumps({"quality": {"status": "valid"}}), encoding="utf-8")
        self.bundle = WheelBundle(self.svg, self.result, self.png)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_healthcheck(self) -> None:
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_homepage_contains_gps_form(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn('id="coordinates-form"', response.text)
        self.assertIn('id="coordinates"', response.text)
        self.assertIn('id="wheel-title"', response.text)
        self.assertIn('id="locate"', response.text)
        self.assertIn('/vignettes/cadran-1.png', response.text)

    def test_reference_thumbnail_is_served(self) -> None:
        response = self.client.get("/vignettes/cadran-1.png")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")

    def test_stylesheet_hides_placeholder_after_generation(self) -> None:
        response = self.client.get("/app.css")
        self.assertEqual(response.status_code, 200)
        self.assertIn(".placeholder[hidden] { display: none; }", response.text)

    def test_svg_endpoint(self) -> None:
        with patch("service.main.generate_wheel", return_value=self.bundle) as generate:
            response = self.client.get("/api/v1/wheel.svg?lat=44.2&lon=3.5&title=Mont%20Aigoual")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/svg+xml")
        self.assertIn(b"<svg", response.content)
        generate.assert_called_once_with(44.2, 3.5, "Mont Aigoual")

    def test_json_endpoint(self) -> None:
        with patch("service.main.generate_wheel", return_value=self.bundle):
            response = self.client.get("/api/v1/wheel?lat=44.2&lon=3.5&format=json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["quality"]["status"], "valid")

    def test_invalid_coordinates_are_rejected_before_generation(self) -> None:
        response = self.client.get("/api/v1/wheel.png?lat=100&lon=3.5")
        self.assertEqual(response.status_code, 422)

    def test_technical_validation_error_has_a_machine_readable_response(self) -> None:
        error = TechnicalValidationError("incomplete_temperature_coverage", "Série incomplète.")
        with patch("service.main.generate_wheel", side_effect=error):
            response = self.client.get("/api/v1/wheel.svg?lat=44.2&lon=3.5")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "incomplete_temperature_coverage")


if __name__ == "__main__":
    unittest.main(verbosity=2)
