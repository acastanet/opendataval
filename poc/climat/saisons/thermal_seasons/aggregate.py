"""Durées annuelles, agrégation décennale et déplacements (§11–§14)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .noleap import NOLEAP_DAYS


@dataclass(frozen=True)
class AnnualDurations:
    spring_length: float | None
    summer_length: float | None
    autumn_length: float | None
    winter_length: float | None


def annual_durations(crossings, next_spring: float | None = None) -> AnnualDurations:
    """Durées en jours (intervalles semi-ouverts, §11).

    ``next_spring`` = spring_start de l'année suivante (nécessaire pour l'hiver
    qui enjambe le 31 décembre). S'il manque, winter_length = None.
    """
    spring = crossings.spring_start
    summer = crossings.summer_start
    autumn = crossings.autumn_start
    winter = crossings.winter_start
    spring_length = summer - spring
    summer_length = autumn - summer
    autumn_length = winter - autumn
    winter_length = None
    if next_spring is not None:
        winter_length = (NOLEAP_DAYS - winter) + next_spring
    return AnnualDurations(spring_length, summer_length, autumn_length, winter_length)


def _percentiles(values: list[float]) -> tuple[float, float, float]:
    arr = np.asarray([v for v in values if v is not None], dtype=float)
    if arr.size == 0:
        return (float("nan"), float("nan"), float("nan"))
    p25 = float(np.percentile(arr, 25, method="linear"))
    median = float(np.percentile(arr, 50, method="linear"))
    p75 = float(np.percentile(arr, 75, method="linear"))
    return p25, median, p75


def summarize(values: list[float | None]) -> dict:
    """P25 / médiane / P75 pour une série décennale (§12)."""
    p25, median, p75 = _percentiles([v for v in values if v is not None])
    return {"p25": p25, "median": median, "p75": p75}


def decade_shift(early: list[float | None], late: list[float | None]) -> float | None:
    """shift_days = médiane(late) - médiane(early) (§13).

    < 0 → plus tôt ; > 0 → plus tard.
    """
    _, early_med, _ = _percentiles(early)
    _, late_med, _ = _percentiles(late)
    if np.isnan(early_med) or np.isnan(late_med):
        return None
    return late_med - early_med
