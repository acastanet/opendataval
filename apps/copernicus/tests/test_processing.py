from __future__ import annotations

import unittest
from datetime import date

import pandas as pd

from copernicus.process.climatology import canonical_day, compute_climatology
from copernicus.process.monthly_thermal import (
    classify_utci,
    compute_monthly_thermal,
    previous_month,
    tropical_nights,
)
from copernicus.requests.climatology import build_climatology_request, nearest_grid_area as nearest_land_grid_area
from copernicus.requests.monthly_thermal import build_monthly_request, nearest_grid_area


class ClimatologyTests(unittest.TestCase):
    def test_leap_day_has_a_stable_canonical_day(self) -> None:
        self.assertEqual(canonical_day(2, 29), 60)
        self.assertEqual(canonical_day(3, 1), 61)

    def test_fifteen_day_window_and_quantiles(self) -> None:
        index = pd.date_range("1991-01-01", "2020-12-31 23:00", freq="1h", tz="UTC")
        temperatures = pd.Series(index.dayofyear.to_numpy(dtype=float), index=index)
        rows = compute_climatology(temperatures)
        self.assertEqual(len(rows), 366)
        self.assertGreater(rows[0].value_count, 0)
        self.assertEqual(rows[0].completeness_pct, 100)

    def test_request_has_an_explicit_reference_period(self) -> None:
        request = build_climatology_request(latitude=44, longitude=3)
        self.assertEqual(request["date"], "1991-01-01/2020-12-31")

    def test_request_selects_one_era5_land_grid_cell(self) -> None:
        self.assertEqual(
            nearest_land_grid_area(latitude=44.081192, longitude=3.641467),
            [44.101, 3.599, 44.099, 3.601],
        )


class ThermalTests(unittest.TestCase):
    def test_thresholds_are_centralized_and_inclusive(self) -> None:
        self.assertEqual(classify_utci(26), "stress thermique modéré")
        self.assertEqual(classify_utci(32), "stress thermique fort")
        self.assertEqual(classify_utci(38), "stress thermique très fort")
        self.assertEqual(classify_utci(46), "stress thermique extrême")

    def test_tropical_night_is_strictly_above_twenty(self) -> None:
        index = pd.date_range("2026-06-01", periods=48, freq="1h", tz="UTC")
        values = pd.Series([20.0] * 24 + [20.1] * 24, index=index)
        self.assertEqual(tropical_nights(values, year=2026, month=6), 1)

    def test_previous_month_handles_january(self) -> None:
        self.assertEqual(previous_month(date(2026, 1, 8)), (2025, 12))
        self.assertEqual(previous_month(date(2026, 7, 8)), (2026, 6))

    def test_incomplete_month_is_not_publishable(self) -> None:
        index = pd.date_range("2026-06-01", periods=24, freq="1h", tz="UTC")
        utci = pd.Series([33.0] * len(index), index=index)
        reference_index = pd.date_range("1991-06-01", "2020-06-30 23:00", freq="1h", tz="UTC")
        reference = pd.Series([25.0] * len(reference_index), index=reference_index)
        result = compute_monthly_thermal(
            utci,
            utci,
            reference,
            year=2026,
            month=6,
        )
        self.assertEqual(result.data_status, "incomplet")
        self.assertEqual(result.strong_stress_dates, ("2026-06-01",))
        self.assertEqual(result.very_strong_stress_dates, ())
        self.assertEqual(result.extreme_stress_dates, ())

    def test_monthly_request_uses_all_days(self) -> None:
        request = build_monthly_request(year=2024, month=2, latitude=44, longitude=3)
        self.assertEqual(len(request["day"]), 29)
        self.assertEqual(request["version"], "1_1")

    def test_monthly_request_selects_one_non_empty_grid_cell(self) -> None:
        self.assertEqual(
            nearest_grid_area(latitude=44.081192, longitude=3.641467),
            [44.001, 3.749, 43.999, 3.751],
        )

    def test_utci_reference_request_has_an_explicit_period(self) -> None:
        from copernicus.requests.monthly_thermal import build_reference_utci_request

        request = build_reference_utci_request(latitude=44, longitude=3)
        self.assertEqual(request["date"], "1991-01-01/2020-12-31")


if __name__ == "__main__":
    unittest.main()
