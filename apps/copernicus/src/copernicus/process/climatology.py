from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


REFERENCE_START = 1991
REFERENCE_END = 2020
WINDOW_DAYS = 15
CANONICAL_DAYS = 366


@dataclass(frozen=True)
class ClimatologyRow:
    day_of_year: int
    tmax_median: float | None
    tmax_p10: float | None
    tmax_p90: float | None
    tmin_median: float | None
    tmin_p10: float | None
    tmin_p90: float | None
    value_count: int
    completeness_pct: float


def canonical_day(month: int, day: int) -> int:
    return int(pd.Timestamp(year=2000, month=month, day=day).dayofyear)


def circular_distance(day_a: pd.Series, day_b: int) -> pd.Series:
    difference = (day_a - day_b).abs()
    return difference.where(difference <= CANONICAL_DAYS / 2, CANONICAL_DAYS - difference)


def _quantile(values: pd.Series, fraction: float) -> float | None:
    propres = values.dropna().to_numpy(dtype=float)
    return None if propres.size == 0 else round(float(np.quantile(propres, fraction)), 1)


def compute_climatology(temperature_c: pd.Series) -> list[ClimatologyRow]:
    if temperature_c.empty:
        return []
    series = temperature_c.sort_index()
    series = series[(series.index.year >= REFERENCE_START) & (series.index.year <= REFERENCE_END)]
    daily = pd.DataFrame({
        "tmax": series.resample("1D").max(),
        "tmin": series.resample("1D").min(),
    }).dropna(how="all")
    daily["canonical_day"] = [canonical_day(ts.month, ts.day) for ts in daily.index]

    expected_index = pd.date_range(
        f"{REFERENCE_START}-01-01",
        f"{REFERENCE_END}-12-31",
        freq="1D",
        tz="UTC",
    )
    expected_days = pd.Series(
        [canonical_day(ts.month, ts.day) for ts in expected_index],
        index=expected_index,
    )

    radius = WINDOW_DAYS // 2
    rows: list[ClimatologyRow] = []
    for target_day in range(1, CANONICAL_DAYS + 1):
        selected = daily[circular_distance(daily["canonical_day"], target_day) <= radius]
        expected_count = int((circular_distance(expected_days, target_day) <= radius).sum())
        complete = selected.dropna(subset=["tmax", "tmin"])
        value_count = len(complete)
        rows.append(ClimatologyRow(
            day_of_year=target_day,
            tmax_median=_quantile(selected["tmax"], 0.5),
            tmax_p10=_quantile(selected["tmax"], 0.1),
            tmax_p90=_quantile(selected["tmax"], 0.9),
            tmin_median=_quantile(selected["tmin"], 0.5),
            tmin_p10=_quantile(selected["tmin"], 0.1),
            tmin_p90=_quantile(selected["tmin"], 0.9),
            value_count=value_count,
            completeness_pct=round(100 * value_count / expected_count, 2) if expected_count else 0,
        ))
    return rows
