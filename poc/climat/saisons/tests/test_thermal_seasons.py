"""Tests unitaires obligatoires (§26) de la logique de saisons thermiques.

Ils utilisent des fixtures synthétiques et ne font AUCUN appel réseau/CDS.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

import json
import numpy as np
import pandas as pd

# Rend le package importable depuis ce dossier tests/.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from thermal_seasons import aggregate, crossings, data, noleap, reference, smoothing, validate  # noqa: E402
from thermal_seasons.pipeline import compute  # noqa: E402
from thermal_seasons.render_svg import render_thermal_seasons_svg  # noqa: E402
from thermal_seasons.schema import empty_document, SCHEMA_VERSION  # noqa: E402


def _annual_sine(amplitude: float, mean: float, phase: float, noise: float = 0.0,
                 seed: int = 0) -> np.ndarray:
    """Cycle annuel sinusoïdal sur 365 jours, + bruit court terme éventuel."""
    x = np.arange(1, 366, dtype=float)
    base = mean + amplitude * np.sin(2 * math.pi * (x - phase) / 365.0)
    if noise:
        rng = np.random.default_rng(seed)
        base = base + rng.normal(0, noise, size=base.shape)
    return base


class TestNoleap(unittest.TestCase):
    def test_feb29_absent(self):
        from datetime import date
        with self.assertRaises(ValueError):
            noleap.date_to_noleap_doy(date(2024, 2, 29))

    def test_roundtrip(self):
        from datetime import date
        for doy in (1, 59, 60, 150, 300, 365):
            md = noleap.noleap_doy_to_month_day(doy)
            month, day = int(md[:2]), int(md[3:5])
            self.assertEqual(noleap.month_day_to_doy(month, day), doy)

    def test_feb29_removed_shifts_march(self):
        from datetime import date
        # 1er mars = DOY 60 en année sans 29 février (au lieu de 60 aussi, car
        # février a 28 jours). Vérifie que mars n'est pas décalé par un 29.
        d = date(2023, 3, 1)
        self.assertEqual(noleap.date_to_noleap_doy(d), 60)


class TestReference(unittest.TestCase):
    def test_thresholds_linear(self):
        # Climatologie triangulaire symétrique : T25 < T75 attendus.
        clim = np.linspace(0, 30, 365)  # pente ; à vérifier T25<T75
        t25, t75 = reference.compute_thresholds(clim)
        self.assertLess(t25, t75)

    def test_thresholds_known_fixture(self):
        # Fixture connue : 365 valeurs progressivement croissantes 0..36.
        # P25 -> ~9, P75 -> ~27 (les percentiles tombent sur la pente linéaire).
        vals = np.linspace(0, 36, 365)
        t25, t75 = reference.compute_thresholds(vals)
        self.assertAlmostEqual(t25, 9.0, delta=1.0)
        self.assertAlmostEqual(t75, 27.0, delta=1.0)
        self.assertLess(t25, t75)


class TestDataCompleteness(unittest.TestCase):
    @staticmethod
    def _hourly_year_with_missing_days(missing_days: set[int]) -> pd.Series:
        dates = pd.date_range("2023-01-01", "2023-12-31", freq="D", tz="UTC")
        timestamps = []
        values = []
        for day in dates:
            if day.dayofyear in missing_days:
                continue
            for hour in range(18):
                timestamps.append(day + pd.Timedelta(hours=hour))
                values.append(10.0)
        return pd.Series(values, index=pd.DatetimeIndex(timestamps))

    def test_small_gaps_are_interpolated_but_not_counted_as_observed(self):
        for missing_days, expected_valid in (({100}, 364), ({100, 101}, 363)):
            with self.subTest(missing_days=missing_days):
                arrays, diagnostics = data.prepare_daily_series_with_diagnostics(
                    self._hourly_year_with_missing_days(missing_days), range(2023, 2024)
                )
                self.assertIn(2023, arrays)
                self.assertEqual(diagnostics[2023]["valid_days"], expected_valid)
                self.assertEqual(diagnostics[2023]["interpolated_days"], len(missing_days))

    def test_long_gap_rejects_the_year(self):
        arrays, diagnostics = data.prepare_daily_series_with_diagnostics(
            self._hourly_year_with_missing_days(set(range(100, 110))), range(2023, 2024)
        )
        self.assertNotIn(2023, arrays)
        self.assertEqual(diagnostics[2023]["valid_days"], 355)
        self.assertEqual(diagnostics[2023]["interpolated_days"], 0)


class TestCrossings(unittest.TestCase):
    def test_crossing_interpolation_uses_correct_doy(self):
        # Une rampe 1..365 franchit 10,5 exactement entre les jours 10 et 11.
        ascending = np.arange(1, 366, dtype=float)
        descending = ascending[::-1]
        self.assertEqual(crossings._ascending_crossing(ascending, 10.5), 10.5)
        self.assertEqual(crossings._descending_crossing(descending, 10.5), 355.5)

    def test_perfect_sine_four_crossings(self):
        series = _annual_sine(amplitude=15, mean=12, phase=80)
        t25, t75 = reference.compute_thresholds(reference.build_climatology({2000: series}))
        smoothed = smoothing.smooth_annual(series)
        c = crossings.detect_crossings(smoothed, t25, t75)
        self.assertIsNotNone(c)
        self.assertLess(c.spring_start, c.summer_start)
        self.assertLess(c.summer_start, c.autumn_start)
        self.assertLess(c.autumn_start, c.winter_start)
        # durées positives
        d = aggregate.annual_durations(c, next_spring=c.spring_start + 365)
        self.assertGreater(d.spring_length, 0)
        self.assertGreater(d.summer_length, 0)
        self.assertGreater(d.autumn_length, 0)

    def test_warming_shifts_summer_earlier_and_longer(self):
        base = _annual_sine(amplitude=15, mean=12, phase=80)
        # Même forme mais +2 °C global : seuils FIXES (calculés sur base).
        t25, t75 = reference.compute_thresholds(reference.build_climatology({2000: base}))
        smoothed_base = smoothing.smooth_annual(base)
        warmed = base + 2.0
        smoothed_warmed = smoothing.smooth_annual(warmed)
        cb = crossings.detect_crossings(smoothed_base, t25, t75)
        cw = crossings.detect_crossings(smoothed_warmed, t25, t75)
        self.assertIsNotNone(cb)
        self.assertIsNotNone(cw)
        # été commence plus tôt et finit plus tard -> plus long
        self.assertLess(cw.summer_start, cb.summer_start)
        self.assertGreater(cw.autumn_start, cb.autumn_start)
        db = aggregate.annual_durations(cb, cb.spring_start + 365)
        dw = aggregate.annual_durations(cw, cw.spring_start + 365)
        self.assertGreater(dw.summer_length, db.summer_length)

    def test_daily_noise_no_spurious_crossings(self):
        series = _annual_sine(amplitude=15, mean=12, phase=80, noise=4.0, seed=1)
        t25, t75 = reference.compute_thresholds(reference.build_climatology({2000: series - 0}))  # seuils via moyenne lissée
        # Utilise les seuils issus d'un cycle propre.
        clean = _annual_sine(amplitude=15, mean=12, phase=80)
        t25, t75 = reference.compute_thresholds(reference.build_climatology({2000: clean}))
        smoothed = smoothing.smooth_annual(series)
        c = crossings.detect_crossings(smoothed, t25, t75)
        self.assertIsNotNone(c)
        self.assertLess(c.spring_start, c.summer_start)
        self.assertLess(c.summer_start, c.autumn_start)
        self.assertLess(c.autumn_start, c.winter_start)


class TestAggregate(unittest.TestCase):
    def test_decade_stats_known(self):
        # 10 dates connues pour chaque décennie.
        early = [50, 55, 60, 62, 58, 53, 57, 61, 59, 54]
        late = [40, 42, 45, 41, 43, 44, 46, 48, 47, 45]
        shift = aggregate.decade_shift(early, late)
        # tardive (médiane ~45) - précoce (médiane ~57.5) => négatif => plus tôt
        self.assertLess(shift, 0)
        s = aggregate.summarize(early)
        self.assertEqual(s["median"], 57.5)

    def test_summarize_handles_none(self):
        s = aggregate.summarize([None, 10, 20, 30, 40])
        self.assertAlmostEqual(s["median"], 25.0, delta=0.01)


class TestValidate(unittest.TestCase):
    def test_growing_season(self):
        # Cycle > 5 °C au cœur de l'été.
        series = _annual_sine(amplitude=15, mean=15, phase=80)
        gs = validate.growing_season_5c(series)
        self.assertIsNotNone(gs.start)
        self.assertIsNotNone(gs.end)
        self.assertGreater(gs.length, 50)

    def test_growing_season_stays_within_calendar(self):
        # Le premier épisode chaud commence au jour 100 et s'achève au jour 200.
        series = np.zeros(365, dtype=float)
        series[99:200] = 10.0
        gs = validate.growing_season_5c(series)
        self.assertEqual(gs.start, 99.5)
        self.assertEqual(gs.end, 200.5)
        self.assertEqual(gs.length, 101.0)

    def test_growing_season_beginning_of_year_has_no_negative_doy(self):
        series = np.zeros(365, dtype=float)
        series[:10] = 10.0
        gs = validate.growing_season_5c(series)
        self.assertEqual(gs.start, 1.0)
        self.assertIsNotNone(gs.end)
        self.assertGreater(gs.end, gs.start)
        self.assertGreater(gs.length, 0)


class TestSchema(unittest.TestCase):
    def test_schema_version(self):
        self.assertEqual(SCHEMA_VERSION, "1.0")

    def test_empty_document_keys(self):
        doc = empty_document("TILE-1", 44.0, 3.0)
        self.assertEqual(len(doc["annual"]), 30)
        self.assertIn("1996-2005", doc["decades"])
        self.assertIn("2006-2015", doc["decades"])
        self.assertIn("2016-2025", doc["decades"])
        self.assertIsNone(doc["thresholds"]["t25_c"])


class TestRender(unittest.TestCase):
    def test_svg_no_scientific_logic(self):
        doc = empty_document("TILE-1", 44.0, 3.0)
        # Remplit deux décennies avec des valeurs factices valides.
        for label in ("1996-2005", "2016-2025"):
            doc["decades"][label] = {
                "spring_start": {"p25": 60, "median": 70, "p75": 80},
                "summer_start": {"p25": 130, "median": 140, "p75": 150},
                "autumn_start": {"p25": 230, "median": 240, "p75": 250},
                "winter_start": {"p25": 310, "median": 320, "p75": 330},
            }
        doc["comparison"]["summer_length_change_days"] = 12.0
        svg = render_thermal_seasons_svg(doc)
        self.assertIn("<svg", svg)
        self.assertIn("Été thermique", svg)
        self.assertIn("role=\"img\"", svg)
        self.assertIn("aria-labelledby", svg)


class TestPipeline(unittest.TestCase):
    """Test d'intégration sur des cycles synthétiques (aucun réseau)."""

    def test_pipeline_synthetic(self):
        # 30 années d'étude + 30 de référence, cycle sinusoïdal + réchauffage.
        from datetime import datetime, timedelta
        from thermal_seasons.noleap import date_to_noleap_doy
        hourly_values = []
        hourly_times = []
        for year in range(1991, 2026):
            # réchauffage progressif de 0 à +2 °C sur la période complète
            warming = 2.0 * (year - 1991) / 34.0
            daily = _annual_sine(amplitude=15, mean=12 + warming, phase=80, seed=year)
            # timestamps quotidiens réels de l'année (gère les bissextiles)
            days = pd.date_range(start=datetime(year, 1, 1), end=datetime(year, 12, 31),
                                 freq="D", tz="UTC")
            for ts in days:
                if ts.month == 2 and ts.day == 29:
                    continue  # suppression du 29 février (§6)
                doy = date_to_noleap_doy(ts.date())
                day_val = daily[doy - 1]
                for h in range(20):  # 20 valeurs horaires -> >= 18 OK
                    hourly_times.append(ts + timedelta(hours=h))
                    hourly_values.append(day_val)
        series = pd.Series(
            np.asarray(hourly_values, dtype=float),
            index=pd.DatetimeIndex(hourly_times),
        )
        doc = compute(series, tile_id="TEST", lat=44.0, lon=3.0)
        self.assertEqual(doc["schema_version"], "1.0")
        self.assertIsNotNone(doc["thresholds"]["t25_c"])
        self.assertLess(doc["thresholds"]["t25_c"], doc["thresholds"]["t75_c"])
        ok = [e for e in doc["annual"] if e["status"] == "ok"]
        self.assertGreater(len(ok), 25)
        # comparaison présente
        self.assertIsNotNone(doc["comparison"]["summer_length_change_days"])


class TestRegressionFixture(unittest.TestCase):
    """Non-régression (§27) : les résultats scientifiques figés ne bougent pas."""

    def test_fixture_values_frozen(self):
        fixture_path = Path(__file__).parent / "fixtures" / "thermal-seasons-fixture.json"
        with fixture_path.open(encoding="utf-8") as fh:
            fix = json.load(fh)
        self.assertEqual(fix["schema_version"], "1.0")
        # Seuils T25/T75 (calculés UNE fois sur 1991–2020).
        self.assertAlmostEqual(fix["thresholds"]["t25_c"], 4.896, places=2)
        self.assertAlmostEqual(fix["thresholds"]["t75_c"], 16.38, places=2)
        self.assertLess(fix["thresholds"]["t25_c"], fix["thresholds"]["t75_c"])
        # Déplacements EARLY -> LATE.
        comp = fix["comparison"]
        self.assertAlmostEqual(comp["summer_start_shift_days"], -17.69, places=1)
        self.assertAlmostEqual(comp["autumn_start_shift_days"], 15.27, places=1)
        self.assertAlmostEqual(comp["summer_length_change_days"], 28.66, places=1)
        # Les trois décennies sont présentes.
        for dec in ("1996-2005", "2006-2015", "2016-2025"):
            self.assertIn(dec, fix["decades"])
            self.assertIn("summer_start", fix["decades"][dec])


class TestVisualV2(unittest.TestCase):
    """Ajustements visuels V2 : non-régression scientifique + connecteurs (§24–§25)."""

    def setUp(self):
        fixture_path = Path(__file__).parent / "fixtures" / "thermal-seasons-fixture.json"
        with fixture_path.open(encoding="utf-8") as fh:
            self.doc = json.load(fh)
        self.svg = render_thermal_seasons_svg(self.doc)

    def test_no_scientific_change(self):
        # §24 : exactement les mêmes valeurs que la fixture figée.
        d = self.doc
        self.assertEqual(d["thresholds"]["t25_c"], 4.896)
        self.assertEqual(d["thresholds"]["t75_c"], 16.38)
        for dec_name, expected in (
            ("1996-2005", {"spring_start": 43.77, "summer_start": 172.26,
                           "autumn_start": 262.14, "winter_start": 336.66}),
            ("2016-2025", {"spring_start": 42.115, "summer_start": 154.57,
                           "autumn_start": 277.415, "winter_start": 342.25}),
        ):
            dec = d["decades"][dec_name]
            for k, v in expected.items():
                self.assertAlmostEqual(dec[k]["median"], v, places=2,
                                       msg=f"{dec_name}.{k}")
        comp = d["comparison"]
        self.assertAlmostEqual(comp["summer_length_change_days"], 28.66, places=2)

    def test_palette_v5(self):
        # Palette catégorielle pastel : bleu, rose, vert, orange.
        self.assertIn("#8DEBFF", self.svg)  # hiver bleu
        self.assertIn("#FF9FC7", self.svg)  # printemps rose
        self.assertIn("#C7F36B", self.svg)  # été vert
        self.assertIn("#FFC45C", self.svg)  # automne orange
        self.assertIn("#C5C4C1", self.svg)  # fond gris neutre

    def test_calendar_reference_bands(self):
        # Une bande blanche de saisons normales et une de mois précèdent les
        # comparaisons thermiques ; aucun connecteur n'encombre leur intervalle.
        self.assertEqual(self.svg.count('class="ts-reference-separator"'), 6)
        self.assertEqual(self.svg.count('class="ts-month-separator"'), 13)
        self.assertNotIn('class="ts-connector"', self.svg)
        # L'été astronomique commence au 21 juin, soit le 172e jour.
        self.assertIn('x1="418.2" y1="118"', self.svg)
        # Le dernier fragment hivernal n'est pas répété dans les trois bandes.
        self.assertEqual(self.svg.count(">HIVER</text>"), 3)


class TestVisualV3(unittest.TestCase):
    """Ajustements visuels V3 (§1–§15) : deux bandes, fond gris, dégradé léger."""

    def setUp(self):
        fixture_path = Path(__file__).parent / "fixtures" / "thermal-seasons-fixture.json"
        with fixture_path.open(encoding="utf-8") as fh:
            self.doc = json.load(fh)
        self.svg = render_thermal_seasons_svg(self.doc)

    def test_no_large_white_plate(self):
        # §5 : pas de grande plaque blanche dominante. Le fond gris doit rester
        # l'élément visuel majeur (Option A : bands sur le gris directement).
        self.assertNotRegex(
            self.svg,
            r'<rect[^>]*width="952"[^>]*height="326"[^>]*fill="#FBFAF7"',
            "une grande plaque blanche 952x326 subsiste",
        )

    def test_gray_background_present(self):
        # §5 : fond gris neutre présent et non masqué par une grande plaque.
        self.assertIn(f'<rect width="1000" height="326" fill="#C5C4C1"', self.svg)

    def test_season_boundary_gradients(self):
        # §6 : 4 dégradés de transition localisés aux frontières saisonnières.
        for gid in ("grad-winter-spring", "grad-spring-summer", "grad-summer-autumn", "grad-autumn-winter"):
            self.assertIn(f'id="{gid}"', self.svg)
        # Chaque bande (2) porte 4 overlays de dégradé -> 8 rects url(#...).
        import re
        grad_rects = re.findall(r'fill="url\(#grad-(?:winter-spring|spring-summer|summer-autumn|autumn-winter)\)"', self.svg)
        self.assertEqual(len(grad_rects), 8)

    def test_gradient_width_in_range(self):
        # Le fondu pastel -> blanc -> pastel couvre toute la zone P25–P75.
        import re
        rects = re.findall(
            r'<rect\s[^>]*fill="url\(#grad-(?:winter-spring|spring-summer|summer-autumn|autumn-winter)\)"[^>]*/>',
            self.svg,
        )
        widths = []
        for r in rects:
            m = re.search(r'width="([\d.]+)"', r)
            if m:
                widths.append(float(m.group(1)))
        self.assertEqual(len(widths), 8)
        self.assertTrue(all(w > 0 for w in widths))

    def test_dotted_uncertainty_and_season_boundaries(self):
        # Chaque frontière a une médiane pointillée ; P25 et P75 bornent une
        # zone grise d'incertitude également pointillée.
        self.assertEqual(self.svg.count('class="ts-season-boundary"'), 8)
        self.assertEqual(self.svg.count('class="ts-uncertainty-boundary"'), 16)
        self.assertEqual(self.svg.count('class="ts-median-connector"'), 4)
        self.assertEqual(self.svg.count('fill="#AEB7B3" opacity="0.36"'), 8)
        self.assertIn('y1="210"', self.svg)  # débordement haut de la 1re bande thermique
        self.assertIn('y2="250"', self.svg)  # débordement bas de la 1re bande thermique

    def test_shadow_on_bands(self):
        # §8 : ombre légère portée sur les deux bandes (silhouettes + filtre).
        self.assertIn('filter="url(#soft-shadow)"', self.svg)
        self.assertIn('<feDropShadow', self.svg)
        # Présence des deux silhouettes de bande portant l'ombre.
        import re
        shadows = re.findall(r'filter="url\(#soft-shadow\)"', self.svg)
        self.assertGreaterEqual(len(shadows), 1)

    def test_no_scientific_change_v3(self):
        # §2 : aucune modification des données scientifiques.
        d = self.doc
        self.assertEqual(d["thresholds"]["t25_c"], 4.896)
        self.assertEqual(d["thresholds"]["t75_c"], 16.38)
        self.assertAlmostEqual(
            d["comparison"]["summer_length_change_days"], 28.66, places=2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
