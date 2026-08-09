from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from copernicus.process.climate_fingerprint import (
    ClimateFingerprintInput,
    build_climate_fingerprint,
    render_climate_fingerprint_svg,
    write_climate_fingerprint,
)


def fixture_data() -> ClimateFingerprintInput:
    daily_index = pd.date_range("1991-01-01", "2025-12-31", freq="1D", tz="UTC")
    ordinal = (daily_index.year - 1991).to_numpy(dtype=float)
    temperature = pd.Series(8 + ordinal * 0.08 + np.sin(daily_index.dayofyear / 30), index=daily_index)
    utci = pd.Series(18 + ordinal * 0.05 + np.sin(daily_index.dayofyear / 20) * 8, index=daily_index)
    precipitation = pd.Series(np.where(daily_index.dayofyear % 9 == 0, 0.012, 0.0008), index=daily_index)
    wind = pd.Series(4 + np.where(daily_index.dayofyear % 17 == 0, 12, 0), index=daily_index)
    monthly_index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    spei = pd.Series(np.sin(monthly_index.month / 2) - (monthly_index.year - 1991) * 0.01, index=monthly_index)
    return ClimateFingerprintInput(temperature, utci, precipitation, spei, wind)


class ClimateFingerprintTests(unittest.TestCase):
    def test_builds_six_rows_and_the_thirty_complete_years(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44.081192, longitude=3.641467)

        self.assertEqual(result["period"], {"start": 1996, "end": 2025})
        rows = result["rows"]
        self.assertEqual(len(rows), 6)
        self.assertEqual([row["id"] for row in rows], ["temperature", "utci", "precipitation", "heavy_rain", "drought", "wind"])
        self.assertEqual(len(rows[0]["years"]), 30)
        self.assertIsNotNone(rows[0]["years"][-1]["value"])
        self.assertEqual(rows[0]["years"][-1]["class"], "beaucoup plus chaud")
        self.assertGreaterEqual(len(result["events"]), 1)
        self.assertLessEqual(len(result["events"]), 8)
        self.assertIn("signal le plus net", result["summary"])
        self.assertEqual(result["comparison"]["metrics"]["precipitation"]["qualifier"], "variabilité élevée")

    def test_incomplete_year_is_neither_classified_nor_compared(self) -> None:
        data = fixture_data()
        missing = data.temperature_c[data.temperature_c.index.year != 2025]
        result = build_climate_fingerprint(
            ClimateFingerprintInput(missing, data.utci_c, data.precipitation_m, data.spei3, data.wind_speed_mps),
            tile_id="ODV-TEST", latitude=44, longitude=3,
        )

        temperature = result["rows"][0]["years"][-1]
        self.assertIsNone(temperature["value"])
        self.assertIsNone(temperature["class"])

    def test_svg_and_json_are_written_as_publishable_assets(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)
        with tempfile.TemporaryDirectory() as directory:
            json_path, svg_path = write_climate_fingerprint(Path(directory), result)
            payload = json.loads(json_path.read_text(encoding="utf-8"))
            svg = svg_path.read_text(encoding="utf-8")

        self.assertEqual(payload["tile_id"], "ODV-TEST")
        self.assertIn("<svg", svg)
        self.assertIn("L’empreinte climatique", svg)
        self.assertIn("Événements", svg)
        self.assertIn('id="missing"', svg)
        self.assertEqual(svg, render_climate_fingerprint_svg(result))


if __name__ == "__main__":
    unittest.main()
