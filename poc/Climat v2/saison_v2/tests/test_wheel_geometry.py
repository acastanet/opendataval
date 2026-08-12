"""Tests déterministes de la géométrie et du rendu de la roue des saisons.

Aucun accès réseau ; s'appuie sur le résultat V4 déjà présent dans output/.
"""

from __future__ import annotations

import json
import math
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from seasons_wheel import geometry  # noqa: E402
from seasons_wheel.config import WheelConfig  # noqa: E402
from seasons_wheel.render import build_document, render_wheel_svg  # noqa: E402

RESULT_PATH = ROOT / "output" / "thermal-seasons-v4-replay.json"


def load_result() -> dict:
    return json.loads(RESULT_PATH.read_text(encoding="utf-8"))


class AngleConversionTest(unittest.TestCase):
    def test_top_doy_maps_to_zero_degrees(self) -> None:
        self.assertAlmostEqual(geometry.angle_from_doy(305.0, top_doy=305.0), 0.0, places=6)

    def test_angle_increases_clockwise_through_the_year(self) -> None:
        # Un jour un peu après top_doy doit être à un angle faible et positif.
        self.assertAlmostEqual(geometry.angle_from_doy(315.0, top_doy=305.0), 10.0 / 365 * 360, places=6)

    def test_reciprocity_for_several_samples(self) -> None:
        for top_doy in (1.0, 90.0, 172.5, 305.0, 364.0):
            for clockwise in (True, False):
                for doy in (1.0, 59.0, 156.83, 255.57, 332.09, 364.5):
                    angle = geometry.angle_from_doy(doy, top_doy, clockwise=clockwise)
                    back = geometry.doy_from_angle(angle, top_doy, clockwise=clockwise)
                    delta = min(abs(back - doy), 365 - abs(back - doy))
                    self.assertLess(delta, 1e-6, msg=f"top_doy={top_doy} clockwise={clockwise} doy={doy}")

    def test_normalize_delta_stays_in_range(self) -> None:
        for value in (-720.0, -181.0, -180.0, 0.0, 180.0, 181.0, 540.0):
            normalized = geometry.normalize_delta(value)
            self.assertGreaterEqual(normalized, -180.0)
            self.assertLess(normalized, 180.0)

    def test_horizontal_top_doy_puts_summer_and_winter_on_a_level_line(self) -> None:
        result = load_result()
        late = result["data"]["decades"]["2016-2025"]["canonical_boundaries"]
        top_doy = geometry.compute_horizontal_top_doy(late)
        summer_mid = (late["summer_start"] + late["autumn_start"]) / 2.0
        winter_mid = ((late["winter_start"] + late["spring_start"] + 365) / 2.0) % 365
        angle_summer = geometry.angle_from_doy(summer_mid, top_doy)
        angle_winter = geometry.angle_from_doy(winter_mid, top_doy)
        # même hauteur (angles supplémentaires à 360°, à un tour près) et été à gauche.
        self.assertLess(abs(geometry.normalize_delta(angle_summer + angle_winter)), 1e-6)
        self.assertGreater(angle_summer, 180.0)
        self.assertLess(angle_winter, 180.0)


class SeasonSpanTest(unittest.TestCase):
    def setUp(self) -> None:
        result = load_result()
        self.boundaries = {
            period: result["data"]["decades"][period]["canonical_boundaries"]
            for period in ("1996-2005", "2016-2025")
        }
        self.comparison = result["data"]["comparison"]

    def test_season_durations_sum_to_the_full_year(self) -> None:
        for period, boundaries in self.boundaries.items():
            spans = geometry.season_spans(boundaries, top_doy=305.0)
            total_days = sum(span.duration_days for span in spans)
            self.assertAlmostEqual(total_days, geometry.NOLEAP_DAYS, places=1, msg=period)
            total_degrees = sum(span.sweep_deg for span in spans)
            self.assertAlmostEqual(total_degrees, 360.0, places=1, msg=period)

    def test_winter_span_crosses_the_calendar_year_boundary(self) -> None:
        boundaries = self.boundaries["1996-2005"]
        spans = {span.name: span for span in geometry.season_spans(boundaries, top_doy=305.0)}
        winter = spans["winter"]
        # L'hiver commence fin novembre et finit fin février : la durée doit être
        # positive et correcte malgré le passage par le 31 décembre. Les bornes
        # sont lues dans le résultat pour rester valables après tout recalcul.
        self.assertGreater(winter.duration_days, 0.0)
        expected = (boundaries["spring_start"] - boundaries["winter_start"]) % geometry.NOLEAP_DAYS
        self.assertAlmostEqual(winter.duration_days, expected, places=1)

    def test_shift_spans_match_the_v4_engine_comparison(self) -> None:
        shifts = geometry.shift_spans(self.boundaries["1996-2005"], self.boundaries["2016-2025"], top_doy=305.0)
        by_boundary = {shift.boundary: shift for shift in shifts}
        expected = {
            "spring_start": self.comparison["spring_start_shift_days"],
            "summer_start": self.comparison["summer_start_shift_days"],
            "autumn_start": self.comparison["autumn_start_shift_days"],
            "winter_start": self.comparison["winter_start_shift_days"],
        }
        for boundary, expected_value in expected.items():
            self.assertAlmostEqual(by_boundary[boundary].shift_days, expected_value, delta=0.05, msg=boundary)

    def test_warm_expansion_direction_matches_known_dataset(self) -> None:
        # Sur ce jeu de données, les quatre décalages allongent la période chaude.
        shifts = geometry.shift_spans(self.boundaries["1996-2005"], self.boundaries["2016-2025"], top_doy=305.0)
        self.assertTrue(all(shift.warm_expansion for shift in shifts))


class DateFormattingTest(unittest.TestCase):
    def test_month_boundaries_nearest(self) -> None:
        self.assertEqual(geometry.format_date(1.0), "1 janv.")
        self.assertEqual(geometry.format_date(31.0), "31 janv.")
        self.assertEqual(geometry.format_date(32.0), "1 févr.")
        self.assertEqual(geometry.format_date(365.0), "31 déc.")

    def test_floor_vs_nearest_rounding(self) -> None:
        self.assertEqual(geometry.format_date(156.83, rounding="floor"), "5 juin")
        self.assertEqual(geometry.format_date(156.83, rounding="nearest"), "6 juin")

    def test_unknown_rounding_rejected(self) -> None:
        with self.assertRaises(ValueError):
            geometry.format_date(10.0, rounding="ceil")


class ArcDashTest(unittest.TestCase):
    def test_arc_length_matches_sweep_fraction_of_circumference(self) -> None:
        radius = 200.0
        circumference = 2 * math.pi * radius
        dasharray, _ = geometry.arc_dash(radius, start_deg=30.0, sweep_deg=90.0)
        length_str, gap_str = dasharray.split()
        self.assertAlmostEqual(float(length_str), circumference * 0.25, places=2)
        self.assertAlmostEqual(float(length_str) + float(gap_str), circumference, places=2)


class WheelConfigTest(unittest.TestCase):
    def test_unknown_key_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            WheelConfig().merged({"not_a_real_field": 1})

    def test_round_trip_through_a_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "wheel-config.json"
            config = WheelConfig().merged({"season_outer": 275.0, "background": "#ffffff"})
            path.write_text(config.to_json(), encoding="utf-8")
            reloaded = WheelConfig.from_file(path)
            self.assertEqual(reloaded.season_outer, 275.0)
            self.assertEqual(reloaded.background, "#ffffff")

    def test_missing_file_returns_defaults(self) -> None:
        config = WheelConfig.from_file(Path("does-not-exist.json"))
        self.assertEqual(config, WheelConfig())


class RenderSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.document = build_document(load_result())
        self.config = WheelConfig()

    def test_ring_is_static_but_active_markers_animate(self) -> None:
        svg = render_wheel_svg(self.document, self.config, state=None)
        self.assertIn("<svg", svg)
        self.assertIn("</svg>", svg)
        # L'anneau des saisons est désormais deux bandes concentriques statiques (ancienne
        # décennie à l'intérieur, récente à l'extérieur) : plus aucun keyframe d'arc.
        for name in ("winter", "spring", "summer", "autumn"):
            self.assertNotIn(f"@keyframes wheel-anim-arc-{name}", svg)
        for key in geometry.BOUNDARY_KEYS:
            self.assertIn(f"@keyframes wheel-anim-active-{key}", svg)

    def test_fill_spring_autumn_adds_their_static_arcs(self) -> None:
        config = self.config.merged({"fill_spring_autumn": True})
        without = render_wheel_svg(self.document, self.config, state=None)
        with_fill = render_wheel_svg(self.document, config, state=None)
        for name in ("spring", "autumn"):
            color = getattr(self.config, name)
            self.assertNotIn(f'stroke="{color}"', without)
            self.assertIn(f'stroke="{color}"', with_fill)

    def test_frozen_state_has_no_animation(self) -> None:
        svg = render_wheel_svg(self.document, self.config, state=self.document["late_period"])
        self.assertNotIn("@keyframes", svg)
        self.assertNotIn("wheel-animated", svg)

    def test_unknown_state_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            render_wheel_svg(self.document, self.config, state="1900-1909")

    def test_combined_labels_follow_their_arc_without_multicolour_tspans(self) -> None:
        svg = render_wheel_svg(self.document, self.config, state=self.document["late_period"])
        decades = self.document["decades"]
        shifts = geometry.shift_spans(decades[self.document["early_period"]], decades[self.document["late_period"]], top_doy=288.0)
        # Trois textPath simples par frontière (date, décalage, date), sans tspan
        # multicolore : la composition reste courbe et CairoSVG ne décale plus les dates.
        self.assertEqual(svg.count("<textPath"), len(shifts) * 3 + 4 + 2)
        self.assertNotIn("<tspan", svg)
        for shift in shifts:
            early_text = geometry.format_date(shift.early_doy, self.config.date_rounding)
            late_text = geometry.format_date(shift.late_doy, self.config.date_rounding)
            self.assertIn(f">{early_text}<", svg)
            self.assertIn(f">{late_text}<", svg)

    def test_season_names_are_curved_text(self) -> None:
        svg = render_wheel_svg(self.document, self.config, state=self.document["late_period"])
        self.assertIn("wheel-2016-2025-season-name-path-summer", svg)
        self.assertIn(">Été<", svg)

    def test_auto_orient_overrides_manual_top_doy(self) -> None:
        auto = self.config.merged({"auto_orient": True})
        manual = self.config.merged({"auto_orient": False, "top_doy": 100.0})
        auto_svg = render_wheel_svg(self.document, auto, state=self.document["late_period"])
        manual_svg = render_wheel_svg(self.document, manual, state=self.document["late_period"])
        self.assertNotEqual(auto_svg, manual_svg)

    def test_svg_ids_do_not_collide_across_states(self) -> None:
        # Plusieurs roues (animée + figées) peuvent être incluses dans une même page
        # (atelier d'aperçu, planche de capture) : leurs id doivent être disjoints,
        # sinon les <textPath>/gradient url(#...) de l'une pointent vers l'autre.
        early_svg = render_wheel_svg(self.document, self.config, state=self.document["early_period"])
        late_svg = render_wheel_svg(self.document, self.config, state=self.document["late_period"])
        early_ids = set(re.findall(r'\bid="([^"]+)"', early_svg))
        late_ids = set(re.findall(r'\bid="([^"]+)"', late_svg))
        self.assertTrue(early_ids, "aucun id trouvé dans le SVG figé early")
        self.assertEqual(early_ids & late_ids, set())

    def test_disabling_animation_in_config_yields_a_static_ring(self) -> None:
        static_config = self.config.merged({"animation_enabled": False})
        svg = render_wheel_svg(self.document, static_config, state=None)
        self.assertNotIn("@keyframes", svg)


if __name__ == "__main__":
    unittest.main(verbosity=2)
