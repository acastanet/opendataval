from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

NOLEAP_DAYS = 365
MIN_HOURLY_PER_DAY = 18
MIN_YEAR_COVERAGE = 0.98
MAX_INTERP_GAP = 2
REFERENCE_PERIOD = (1991, 2020)
PERCENTILE_METHOD = "linear"
_MONTH_LENGTHS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
_CUMULATIVE = [0]
for _length in _MONTH_LENGTHS:
    _CUMULATIVE.append(_CUMULATIVE[-1] + _length)


def _is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def date_to_noleap_doy(value: date) -> int:
    if value.month == 2 and value.day == 29:
        raise ValueError("Le 29 février n'existe pas dans le calendrier no-leap")
    doy = _CUMULATIVE[value.month - 1] + value.day
    if _is_leap(value.year) and value.month > 2:
        doy -= 1
    return doy


def hourly_to_daily(temperature_c: pd.Series) -> pd.Series:
    if not isinstance(temperature_c.index, pd.DatetimeIndex):
        raise ValueError("La série doit être indexée par date UTC")
    index = (
        temperature_c.index.tz_localize("UTC")
        if temperature_c.index.tz is None
        else temperature_c.index.tz_convert("UTC")
    )
    series = pd.Series(
        pd.to_numeric(temperature_c, errors="coerce").to_numpy(dtype=float),
        index=index,
    )
    daily_mean = series.resample("1D").mean()
    daily_count = series.resample("1D").count()
    return daily_mean.where(daily_count >= MIN_HOURLY_PER_DAY, other=float("nan"))


def _interpolate_small_gaps(daily: np.ndarray) -> tuple[np.ndarray, int]:
    filled = daily.copy()
    nan_mask = np.isnan(daily)
    interpolated = 0
    i = 0
    n = len(daily)
    while i < n:
        if not nan_mask[i]:
            i += 1
            continue
        j = i
        while j < n and nan_mask[j]:
            j += 1
        gap = j - i
        if gap <= MAX_INTERP_GAP and i > 0 and j < n:
            interpolated += gap
            left = filled[i - 1]
            right = filled[j]
            for k in range(i, j):
                filled[k] = left + (right - left) * (k - i + 1) / (j - i + 1)
        i = j
    return filled, interpolated


def _remove_leap_day(daily: pd.Series, year: int) -> tuple[np.ndarray, int, int]:
    subset = daily[daily.index.year == year]
    values = np.full(NOLEAP_DAYS, np.nan)
    for timestamp, value in subset.items():
        if timestamp.month == 2 and timestamp.day == 29:
            continue
        if np.isnan(value):
            continue
        values[date_to_noleap_doy(timestamp.date()) - 1] = value
    valid_days = int(np.isfinite(values).sum())
    filled, interpolated_days = _interpolate_small_gaps(values)
    return filled, valid_days, interpolated_days


def prepare_daily_series_with_diagnostics(
    hourly_c: pd.Series,
    years: range,
) -> tuple[dict[int, np.ndarray], dict[int, dict[str, int]]]:
    daily = hourly_to_daily(hourly_c)
    arrays: dict[int, np.ndarray] = {}
    diagnostics: dict[int, dict[str, int]] = {}
    for year in years:
        values, valid_days, interpolated_days = _remove_leap_day(daily, year)
        diagnostics[year] = {
            "valid_days": valid_days,
            "interpolated_days": interpolated_days,
        }
        if valid_days >= NOLEAP_DAYS * MIN_YEAR_COVERAGE:
            arrays[year] = values
    return arrays, diagnostics


def build_climatology(daily_by_year: dict[int, np.ndarray]) -> np.ndarray:
    years = sorted(
        year
        for year, values in daily_by_year.items()
        if REFERENCE_PERIOD[0] <= year <= REFERENCE_PERIOD[1]
        and np.ndim(values) == 1
        and values.size == NOLEAP_DAYS
    )
    if not years:
        raise ValueError("Aucune année de référence 1991–2020 disponible")
    return np.nanmean(
        np.vstack([np.asarray(daily_by_year[year], dtype=float) for year in years]),
        axis=0,
    )


def compute_thresholds(climatology: np.ndarray) -> tuple[float, float]:
    values = np.asarray(climatology, dtype=float)
    if values.size != NOLEAP_DAYS:
        raise ValueError("La climatologie doit contenir 365 valeurs")
    return (
        float(np.percentile(values, 25, method=PERCENTILE_METHOD)),
        float(np.percentile(values, 75, method=PERCENTILE_METHOD)),
    )


def smooth_annual(series_c: np.ndarray) -> np.ndarray:
    x = np.arange(1, NOLEAP_DAYS + 1, dtype=float)
    y = np.asarray(series_c, dtype=float)
    valid = ~np.isnan(y)
    if valid.sum() < 4:
        return np.full(NOLEAP_DAYS, np.nan)
    coeffs = np.polyfit(x[valid], y[valid], 3)
    return np.polyval(coeffs, x)


def fit_rmse(smoothed: np.ndarray, original: np.ndarray) -> float:
    s = np.asarray(smoothed, dtype=float)
    o = np.asarray(original, dtype=float)
    valid = ~(np.isnan(s) | np.isnan(o))
    if valid.sum() < 2:
        return float("nan")
    return float(np.sqrt(np.mean((o[valid] - s[valid]) ** 2)))


@dataclass(frozen=True)
class Crossings:
    spring_start: float
    summer_start: float
    autumn_start: float
    winter_start: float


def _ascending_crossing(smoothed: np.ndarray, threshold: float) -> float | None:
    values = np.asarray(smoothed, dtype=float)
    for doy in range(2, NOLEAP_DAYS + 1):
        previous = values[doy - 2]
        current = values[doy - 1]
        if np.isnan(previous) or np.isnan(current):
            continue
        if previous < threshold <= current:
            fraction = (threshold - previous) / (current - previous)
            return float((doy - 1) + fraction)
    return None


def _descending_crossing(smoothed: np.ndarray, threshold: float) -> float | None:
    values = np.asarray(smoothed, dtype=float)
    for doy in range(2, NOLEAP_DAYS + 1):
        previous = values[doy - 2]
        current = values[doy - 1]
        if np.isnan(previous) or np.isnan(current):
            continue
        if previous >= threshold > current:
            fraction = (threshold - previous) / (current - previous)
            return float((doy - 1) + fraction)
    return None


def detect_crossings(smoothed: np.ndarray, t25: float, t75: float) -> Crossings | None:
    spring = _ascending_crossing(smoothed, t25)
    summer = _ascending_crossing(smoothed, t75)
    autumn = _descending_crossing(smoothed, t75)
    winter = _descending_crossing(smoothed, t25)
    if None in (spring, summer, autumn, winter):
        return None
    assert spring is not None and summer is not None and autumn is not None and winter is not None
    if not (1.0 <= spring < summer < autumn < winter <= NOLEAP_DAYS):
        return None
    return Crossings(spring, summer, autumn, winter)


@dataclass(frozen=True)
class AnnualDurations:
    spring_length: float | None
    summer_length: float | None
    autumn_length: float | None
    winter_length: float | None


def annual_durations(crossings: Crossings, next_spring: float | None = None) -> AnnualDurations:
    winter_length = None
    if next_spring is not None:
        winter_length = (NOLEAP_DAYS - crossings.winter_start) + next_spring
    return AnnualDurations(
        crossings.summer_start - crossings.spring_start,
        crossings.autumn_start - crossings.summer_start,
        crossings.winter_start - crossings.autumn_start,
        winter_length,
    )


def summarize(values: list[float | None]) -> dict[str, float]:
    array = np.asarray([value for value in values if value is not None], dtype=float)
    if array.size == 0:
        return {"p25": float("nan"), "median": float("nan"), "p75": float("nan")}
    return {
        "p25": float(np.percentile(array, 25, method="linear")),
        "median": float(np.percentile(array, 50, method="linear")),
        "p75": float(np.percentile(array, 75, method="linear")),
    }


@dataclass(frozen=True)
class GrowingSeason:
    start: float | None
    end: float | None
    length: float | None


def growing_season_5c(daily_c: np.ndarray) -> GrowingSeason:
    values = np.asarray(daily_c, dtype=float)
    warm = ~np.isnan(values)
    above = (values > 5.0) & warm
    start = None
    for doy in range(1, NOLEAP_DAYS - 3):
        if above[doy - 1 : doy + 4].all():
            if (
                doy == 1
                or np.isnan(values[doy - 2])
                or np.isnan(values[doy - 1])
                or not (values[doy - 2] <= 5.0 < values[doy - 1])
            ):
                start = float(doy)
            else:
                fraction = (5.0 - values[doy - 2]) / (values[doy - 1] - values[doy - 2])
                start = float((doy - 1) + fraction)
            break
    if start is None:
        return GrowingSeason(None, None, None)
    end = None
    first_possible_end = max(1, int(np.ceil(start)) + 5)
    for doy in range(first_possible_end, NOLEAP_DAYS - 3):
        if (~above[doy - 1 : doy + 4]).all():
            if (
                doy == 1
                or np.isnan(values[doy - 2])
                or np.isnan(values[doy - 1])
                or not (values[doy - 2] >= 5.0 > values[doy - 1])
            ):
                end = float(doy)
            else:
                fraction = (5.0 - values[doy - 2]) / (values[doy - 1] - values[doy - 2])
                end = float((doy - 1) + fraction)
            break
    length = end - start if end is not None and end > start else None
    return GrowingSeason(start, end, length)


def qa_annual(crossings: Crossings | None, durations: AnnualDurations | None) -> tuple[bool, str | None]:
    if crossings is None:
        return False, "invalid_crossings"
    if not (
        1.0
        <= crossings.spring_start
        < crossings.summer_start
        < crossings.autumn_start
        < crossings.winter_start
        <= NOLEAP_DAYS
    ):
        return False, "invalid_crossings"
    if durations is not None:
        if any(
            value is not None and value <= 0
            for value in (
                durations.spring_length,
                durations.summer_length,
                durations.autumn_length,
            )
        ):
            return False, "non_positive_length"
    return True, None
