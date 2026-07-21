from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd


REFERENCE_START = 1991
REFERENCE_END = 2020


@dataclass(frozen=True)
class MonthlyThermalResult:
    utci_max_c: float | None
    max_category: str | None
    strong_stress_days: int
    very_strong_stress_days: int
    extreme_stress_days: int
    strong_stress_dates: tuple[str, ...]
    very_strong_stress_dates: tuple[str, ...]
    extreme_stress_dates: tuple[str, ...]
    tropical_nights: int
    reference_strong_stress_days: float | None
    strong_stress_anomaly: float | None
    completeness_pct: float
    data_status: str


def previous_month(reference: date) -> tuple[int, int]:
    return (reference.year - 1, 12) if reference.month == 1 else (reference.year, reference.month - 1)


def classify_utci(value_c: float | None) -> str | None:
    if value_c is None or not np.isfinite(value_c):
        return None
    if value_c >= 46:
        return "stress thermique extrême"
    if value_c >= 38:
        return "stress thermique très fort"
    if value_c >= 32:
        return "stress thermique fort"
    if value_c >= 26:
        return "stress thermique modéré"
    return "sans stress thermique chaud significatif"


def tropical_nights(temperature_c: pd.Series, *, year: int, month: int) -> int:
    selected = temperature_c[
        (temperature_c.index.year == year) & (temperature_c.index.month == month)
    ]
    return int((selected.resample("1D").min() > 20).sum())


def _reference_days(utci_reference_c: pd.Series, month: int) -> float | None:
    selected = utci_reference_c[
        (utci_reference_c.index.year >= REFERENCE_START)
        & (utci_reference_c.index.year <= REFERENCE_END)
        & (utci_reference_c.index.month == month)
    ]
    if selected.empty:
        return None
    daily_max = selected.resample("1D").max()
    yearly = (daily_max >= 32).groupby(daily_max.index.year).sum()
    if len(yearly) < REFERENCE_END - REFERENCE_START + 1:
        return None
    return round(float(np.median(yearly.to_numpy(dtype=float))), 1)


def _threshold_dates(daily_max: pd.Series, threshold: float) -> tuple[str, ...]:
    return tuple(timestamp.strftime("%Y-%m-%d") for timestamp in daily_max[daily_max >= threshold].index)


def compute_monthly_thermal(
    utci_c: pd.Series,
    temperature_c: pd.Series,
    utci_reference_c: pd.Series,
    *,
    year: int,
    month: int,
) -> MonthlyThermalResult:
    selected = utci_c[(utci_c.index.year == year) & (utci_c.index.month == month)]
    expected_hours = calendar.monthrange(year, month)[1] * 24
    completeness = round(100 * min(len(selected), expected_hours) / expected_hours, 2)
    daily_max = selected.resample("1D").max().dropna()
    maximum = round(float(daily_max.max()), 1) if not daily_max.empty else None
    strong_dates = _threshold_dates(daily_max, 32)
    very_strong_dates = _threshold_dates(daily_max, 38)
    extreme_dates = _threshold_dates(daily_max, 46)
    strong_days = len(strong_dates)
    very_strong_days = len(very_strong_dates)
    extreme_days = len(extreme_dates)
    reference_days = _reference_days(utci_reference_c, month)
    anomaly = round(strong_days - reference_days, 1) if reference_days is not None else None
    status = "complet" if completeness == 100 and len(daily_max) == calendar.monthrange(year, month)[1] else "incomplet"
    return MonthlyThermalResult(
        utci_max_c=maximum,
        max_category=classify_utci(maximum),
        strong_stress_days=strong_days,
        very_strong_stress_days=very_strong_days,
        extreme_stress_days=extreme_days,
        strong_stress_dates=strong_dates,
        very_strong_stress_dates=very_strong_dates,
        extreme_stress_dates=extreme_dates,
        tropical_nights=tropical_nights(temperature_c, year=year, month=month),
        reference_strong_stress_days=reference_days,
        strong_stress_anomaly=anomaly,
        completeness_pct=completeness,
        data_status=status,
    )
