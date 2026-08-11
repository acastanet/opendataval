"""Tests du calendrier no-leap et des garde-fous de la chaîne V4.

Aucun accès réseau : les séries sont synthétiques.
"""

from __future__ import annotations

import calendar
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from climate_seasons_service.science import (  # noqa: E402
    NOLEAP_DAYS,
    date_to_noleap_doy,
    prepare_daily_series_with_diagnostics,
)


def hourly_fixture(start: int, end: int) -> pd.Series:
    """Cycle annuel horaire déterministe, sans 29 février manquant."""
    index = pd.date_range(f"{start}-01-01T00:00:00Z", f"{end}-12-31T23:00:00Z", freq="h")
    day = index.dayofyear.to_numpy()
    return pd.Series(11 + 10 * np.sin((day - 82) * 2 * np.pi / 365), index=index)


class NoLeapCalendarTest(unittest.TestCase):
    def test_every_day_of_a_leap_year_gets_its_own_rank(self) -> None:
        """Le 1er mars ne doit pas écraser le 28 février."""
        for year in (1992, 1996, 2000, 2020, 2024):
            ranks = [
                date_to_noleap_doy(date(year, month, day))
                for month in range(1, 13)
                for day in range(1, calendar.monthrange(year, month)[1] + 1)
                if not (month == 2 and day == 29)
            ]
            self.assertEqual(len(ranks), NOLEAP_DAYS, f"{year} : nombre de jours inattendu")
            self.assertEqual(sorted(ranks), list(range(1, NOLEAP_DAYS + 1)), f"{year} : rangs non bijectifs")

    def test_ranks_match_between_leap_and_common_years(self) -> None:
        """Un même jour civil occupe le même rang, que l'année soit bissextile ou non."""
        for month, day in ((1, 1), (2, 28), (3, 1), (7, 14), (12, 31)):
            self.assertEqual(
                date_to_noleap_doy(date(1996, month, day)),
                date_to_noleap_doy(date(1997, month, day)),
                f"{day:02d}/{month:02d} : rang divergent entre 1996 et 1997",
            )

    def test_february_29_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            date_to_noleap_doy(date(2020, 2, 29))

    def test_complete_years_report_365_valid_days(self) -> None:
        arrays, diagnostics = prepare_daily_series_with_diagnostics(hourly_fixture(1995, 2000), range(1995, 2001))
        for year in range(1995, 2001):
            self.assertEqual(diagnostics[year]["valid_days"], NOLEAP_DAYS, f"{year} : jour manquant")
            self.assertEqual(diagnostics[year]["interpolated_days"], 0)
            self.assertFalse(np.isnan(arrays[year]).any(), f"{year} : trou dans la série no-leap")

    def test_march_first_of_a_leap_year_keeps_its_own_value(self) -> None:
        """Régression : la valeur du 1er mars ne doit pas remplacer celle du 28 février."""
        series = hourly_fixture(2020, 2020)
        marker = pd.Timestamp("2020-03-01T00:00:00Z")
        series.loc[marker : marker + timedelta(hours=23)] = 99.0
        arrays, _ = prepare_daily_series_with_diagnostics(series, range(2020, 2021))
        values = arrays[2020]
        self.assertEqual(values[date_to_noleap_doy(date(2020, 3, 1)) - 1], 99.0)
        self.assertNotEqual(values[date_to_noleap_doy(date(2020, 2, 28)) - 1], 99.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
