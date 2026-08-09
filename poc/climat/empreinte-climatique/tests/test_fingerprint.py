from __future__ import annotations

import json
import re
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import numpy as np
import pandas as pd

from empreinte_climatique.fingerprint import (
    COMMON_PALETTE,
    ClimateFingerprintInput,
    _balance_cell,
    _balance_metrics,
    _cell_color,
    build_climate_fingerprint,
    render_exceptional_events_svg,
    render_climate_fingerprint_svg,
    write_climate_fingerprint,
    write_climate_fingerprint_v4,
)


def _rgb(color: str) -> tuple[int, int, int]:
    value = color.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


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
        self.assertNotIn("Événements exceptionnels", svg)
        self.assertIn('id="missing"', svg)
        self.assertEqual(svg, render_climate_fingerprint_svg(result))

    def test_v4_renderer_keeps_the_frozen_v3_data_unchanged(self) -> None:
        """La V4 est une passe graphique : valeurs, événements et écarts sont gelés."""
        fixture = Path(__file__).parent / "fixtures" / "fingerprint-reference.json"
        fingerprint = json.loads(fixture.read_text(encoding="utf-8"))
        before = deepcopy(fingerprint)

        svg = render_climate_fingerprint_svg(fingerprint)

        self.assertEqual(fingerprint["rows"], before["rows"])
        self.assertEqual(fingerprint["events"], before["events"])
        self.assertEqual(fingerprint["comparison"], before["comparison"])
        self.assertEqual(len(fingerprint["rows"]), 6)
        self.assertTrue(all(len(row["years"]) == 30 for row in fingerprint["rows"]))
        self.assertIn('id="common-gradient"', svg)
        self.assertNotIn("Événements exceptionnels", svg)
        self.assertIn('font-family:system-ui', svg)
        self.assertNotIn("Code injected by live-server", svg)
        self.assertNotIn("WebSocket", svg)

    def test_v4_marks_missing_and_not_applicable_without_resembling_normal(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)
        result["rows"][0]["years"][0]["value"] = None
        result["rows"][1]["years"][1]["applicable"] = False

        svg = render_climate_fingerprint_svg(result)

        self.assertIn('fill="url(#missing)"', svg)
        self.assertIn('fill="url(#not-applicable)"', svg)
        self.assertIn("donnée indisponible", svg)
        self.assertIn("indicateur non pertinent", svg)

    def test_v4_uses_one_common_palette_and_moves_events_out_of_the_matrix(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)
        result["events"] = [
            {"date_start": "2019-07-01", "date_end": "2019-07-03", "family": "heat", "label": "stress thermique exceptionnel"},
            {"date_start": "2019-09-01", "date_end": "2019-09-02", "family": "heavy_rain", "label": "épisode de pluie extrême"},
            {"date_start": "2020-08-01", "date_end": "2020-08-31", "family": "drought", "label": "séquence de sécheresse"},
            {"date_start": "2020-12-01", "date_end": "2020-12-02", "family": "wind", "label": "épisode de vent extrême"},
        ]

        svg = render_climate_fingerprint_svg(result)

        events_svg = render_exceptional_events_svg(result)
        self.assertEqual(COMMON_PALETTE[0][1], "#2166AC")
        self.assertEqual(COMMON_PALETTE[-1][1], "#B2182B")
        self.assertEqual(_cell_color("temperature", {"percentile": 50}), "#FBFAF7")
        self.assertIn('id="common-gradient"', svg)
        self.assertNotIn("stress thermique exceptionnel", svg)
        self.assertNotIn("épisode de pluie extrême", svg)
        self.assertNotIn("rx=", svg)
        self.assertNotIn('width="186"', svg)
        first_row = re.findall(r'<rect x="(\d+)" y="142" width="18" height="34"', svg)
        self.assertEqual([int(value) for value in first_row], [218 + 18 * index for index in range(30)])
        self.assertIn("Événements exceptionnels", events_svg)
        self.assertIn("chaleur", events_svg)
        self.assertIn("pluie", events_svg)
        self.assertIn("sécheresse", events_svg)
        self.assertIn("vent", events_svg)
        self.assertGreaterEqual(events_svg.count("<polygon"), 2)
        self.assertIn("<circle", events_svg)

    def test_v4_common_gradient_means_red_is_always_more(self) -> None:
        """Empêche une future inversion, notamment pour les précipitations."""
        for row_id in ("temperature", "utci", "precipitation", "heavy_rain", "drought", "wind"):
            self.assertEqual(_cell_color(row_id, {"percentile": 0}), "#2166AC")
            self.assertEqual(_cell_color(row_id, {"percentile": 100}), "#B2182B")
        self.assertEqual(_cell_color("heavy_rain", {"percentile": 100, "class_index": 0}), "#2166AC")

    def test_ordinary_years_stay_white_while_extremes_reach_the_palette_ends(self) -> None:
        """La palette est inchangée : c'est l'échelle qui réserve la couleur à l'exceptionnel."""
        reference = {"p10": 8.0, "p50": 10.0, "p90": 12.0}
        sigma = (12.0 - 8.0) / 2.563

        ordinary = _cell_color("temperature", {"value": 10.0 + sigma}, reference)
        self.assertLessEqual(max(abs(a - b) for a, b in zip(_rgb(ordinary), _rgb("#FBFAF7"))), 8)
        self.assertEqual(_cell_color("temperature", {"value": 10.0 + 3 * sigma}, reference), "#B2182B")
        self.assertEqual(_cell_color("temperature", {"value": 10.0 - 3 * sigma}, reference), "#2166AC")
        # Un écart de 2 σ doit se voir franchement, sans quoi l'échelle n'alerte plus.
        marked = _cell_color("temperature", {"value": 10.0 + 2 * sigma}, reference)
        self.assertGreaterEqual(max(abs(a - b) for a, b in zip(_rgb(marked), _rgb("#FBFAF7"))), 60)

    def test_two_record_years_no_longer_share_the_same_red(self) -> None:
        """Le rang saturait à P100 : deux records d'intensité différente se confondaient."""
        reference = {"p10": 8.0, "p50": 10.0, "p90": 12.0}

        strong = _cell_color("temperature", {"value": 12.5, "percentile": 100}, reference)
        stronger = _cell_color("temperature", {"value": 14.0, "percentile": 100}, reference)

        self.assertNotEqual(strong, stronger)
        self.assertEqual(_cell_color("temperature", {"value": 14.0, "percentile": 100}), "#B2182B")
        incomplete = {"p10": None, "p50": 10.0, "p90": 12.0}
        self.assertEqual(_cell_color("temperature", {"value": 14.0, "percentile": 100}, incomplete), "#B2182B")

    def test_balance_index_is_signed_and_lets_excess_and_deficit_compensate(self) -> None:
        # Deux excès et deux déficits de même ampleur : l'indice s'annule. C'est la
        # contrepartie assumée d'un bilan signé, et le tooltip doit l'exposer.
        compensated = [
            {"years": [{"value": 1, "percentile": 100}]},
            {"years": [{"value": 1, "percentile": 90}]},
            {"years": [{"value": 1, "percentile": 10}]},
            {"years": [{"value": 1, "percentile": 0}]},
        ]
        mean, above, below, count = _balance_metrics(compensated, 0)
        color, tooltip = _balance_cell(compensated, 0, 2025)

        self.assertAlmostEqual(mean, 0.0, places=9)
        self.assertEqual((above, below, count), (2, 2, 4))
        self.assertEqual(color, "#FBFAF7")
        self.assertIn("Indice signé : +0%", tooltip)
        self.assertIn("Exceptionnellement hauts : 2 / 4", tooltip)
        self.assertIn("Exceptionnellement bas : 2 / 4", tooltip)
        self.assertIn("se compensent", tooltip)

        highest = [{"years": [{"value": 1, "percentile": 100}]} for _ in range(4)]
        lowest = [{"years": [{"value": 1, "percentile": 0}]} for _ in range(4)]
        ordinary = [{"years": [{"value": 1, "percentile": 50}]} for _ in range(6)]
        self.assertEqual(_balance_cell(highest, 0, 2025)[0], "#B2182B")
        self.assertEqual(_balance_cell(lowest, 0, 2025)[0], "#2166AC")
        self.assertEqual(_balance_cell(ordinary, 0, 2025)[0], "#FBFAF7")

        # Un seul indicateur extrême sur six se voit, mais ne sature pas le bilan.
        lone = [{"years": [{"value": 1, "percentile": 100 if position == 0 else 50}]} for position in range(6)]
        lone_color = _balance_cell(lone, 0, 2025)[0]
        self.assertGreater(max(abs(a - b) for a, b in zip(_rgb(lone_color), _rgb("#FBFAF7"))), 20)
        self.assertGreater(max(abs(a - b) for a, b in zip(_rgb(lone_color), _rgb("#B2182B"))), 60)

        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)
        svg = render_climate_fingerprint_svg(result)
        self.assertIn("Empreinte bilan", svg)
        self.assertEqual(svg.count('height="34"'), 30 * 7)

    def test_each_row_is_one_continuous_band_marked_by_two_decade_rules(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)

        svg = render_climate_fingerprint_svg(result)

        columns = [int(value) for value in re.findall(r'<rect x="(\d+)" y="142" width="18" height="34"', svg)]
        self.assertEqual(len(columns), 30)
        self.assertEqual({later - earlier for earlier, later in zip(columns, columns[1:])}, {18})
        self.assertEqual(svg.count('stroke-dasharray="2 3"'), 2)
        self.assertNotIn('fill="#F5F6F3"', svg)
        self.assertIn("1996–2005", svg)
        self.assertIn("2016–2025", svg)

    def test_only_decade_boundary_years_are_still_labelled(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)

        svg = render_climate_fingerprint_svg(result)

        for year in (1996, 2005, 2015, 2025):
            self.assertIn(f'class="year" text-anchor="middle">{year}<', svg)
        for year in (2000, 2010, 2020):
            self.assertNotIn(f'class="year" text-anchor="middle">{year}<', svg)

    def test_bottom_legend_is_centred_under_the_matrix(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)

        svg = render_climate_fingerprint_svg(result)

        bar_match = re.search(r'<rect x="([\d.]+)"[^>]*width="220" height="10" fill="url\(#common-gradient\)"', svg)
        self.assertIsNotNone(bar_match)
        bar_x = float(bar_match.group(1))
        matrix_center = 218 + 30 * 18 / 2
        self.assertAlmostEqual(bar_x + 110, matrix_center, delta=0.5)
        self.assertIn(f'x="{matrix_center:.1f}" y="', svg)

    def test_the_decade_header_is_split_on_two_lines_without_the_years_beneath(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)

        svg = render_climate_fingerprint_svg(result)

        self.assertIn('class="comparison-title">Écart entre<', svg)
        self.assertIn('class="comparison-title">les décennies<', svg)
        self.assertNotIn("1996–2005 → 2016–2025", svg)

    def test_the_neutral_theme_only_changes_the_ground_under_the_bands(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)

        light = render_climate_fingerprint_svg(result)
        neutral = render_climate_fingerprint_svg(result, theme="neutral")

        self.assertIn('fill="#FAFAF7"', light)
        self.assertIn('fill="#C5C4C1"', neutral)
        self.assertNotIn('filter="url(#band-shadow)"', light)
        self.assertEqual(neutral.count('filter="url(#band-shadow)"'), 7)
        # Les cellules sont le contrat : une seule des deux versions peut être publiée
        # comme référence, mais aucune ne doit recolorer quoi que ce soit.
        pattern = r'<rect x="\d+" y="\d+" width="18" height="34" fill="(#[0-9A-F]{6}|url\(#[a-z-]+\))"'
        self.assertEqual(re.findall(pattern, light), re.findall(pattern, neutral))
        with self.assertRaises(ValueError):
            render_climate_fingerprint_svg(result, theme="sombre")

    def test_no_rule_detaches_the_balance_row_anymore(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)

        svg = render_climate_fingerprint_svg(result)

        # Plus aucun trait horizontal : seuls les deux filets décennaux verticaux
        # subsistent, en plus de la hachure interne du motif « donnée manquante ».
        self.assertIsNone(re.search(r'<line x1="\d+" y1="(\d+)" x2="\d+" y2="\1"', svg))
        self.assertEqual(svg.count('stroke-dasharray="2 3"'), 2)

    def test_v4_writer_outputs_four_independent_deliverables(self) -> None:
        result = build_climate_fingerprint(fixture_data(), tile_id="ODV-TEST", latitude=44, longitude=3)
        with tempfile.TemporaryDirectory() as directory:
            json_path, svg_path, neutral_path, events_path = write_climate_fingerprint_v4(Path(directory), result)
            self.assertEqual(json.loads(json_path.read_text(encoding="utf-8")), result)
            self.assertIn("L’empreinte climatique du lieu", svg_path.read_text(encoding="utf-8"))
            self.assertIn('fill="#C5C4C1"', neutral_path.read_text(encoding="utf-8"))
            self.assertIn("Événements exceptionnels", events_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
