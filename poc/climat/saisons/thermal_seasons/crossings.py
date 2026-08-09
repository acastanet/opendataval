"""Détection des quatre transitions thermiques annuelles (§9–§11)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .noleap import NOLEAP_DAYS


@dataclass(frozen=True)
class Crossings:
    """Frontières en DOY flottant (interpolation linéaire, §10)."""

    spring_start: float      # franchissement ascendant de T25
    summer_start: float      # franchissement ascendant de T75
    autumn_start: float      # franchissement descendant de T75
    winter_start: float      # franchissement descendant de T25


def _ascending_crossing(smoothed: np.ndarray, threshold: float) -> float | None:
    """Premier franchissement ascendant S[d-1] < T <= S[d], interpolé (§10)."""
    s = np.asarray(smoothed, dtype=float)
    # ``d`` est un DOY 1-indexé. Les deux valeurs encadrantes sont donc les
    # indices ``d - 2`` (jour d-1) et ``d - 1`` (jour d), y compris pour d=365.
    for d in range(2, NOLEAP_DAYS + 1):
        previous = s[d - 2]
        current = s[d - 1]
        if np.isnan(previous) or np.isnan(current):
            continue
        if previous < threshold <= current:
            fraction = (threshold - previous) / (current - previous)
            return float((d - 1) + fraction)
    return None


def _descending_crossing(smoothed: np.ndarray, threshold: float) -> float | None:
    """Premier franchissement descendant S[d-1] >= T > S[d], interpolé (§10)."""
    s = np.asarray(smoothed, dtype=float)
    for d in range(2, NOLEAP_DAYS + 1):
        previous = s[d - 2]
        current = s[d - 1]
        if np.isnan(previous) or np.isnan(current):
            continue
        if previous >= threshold > current:
            fraction = (threshold - previous) / (current - previous)
            return float((d - 1) + fraction)
    return None


def detect_crossings(smoothed: np.ndarray, t25: float, t75: float) -> Crossings | None:
    """Renvoie None si l'ordre obligatoire n'est pas satisfait (§9)."""
    spring = _ascending_crossing(smoothed, t25)
    summer = _ascending_crossing(smoothed, t75)
    autumn = _descending_crossing(smoothed, t75)
    winter = _descending_crossing(smoothed, t25)
    if None in (spring, summer, autumn, winter):
        return None
    if not (1.0 <= spring < summer < autumn < winter <= NOLEAP_DAYS):
        return None
    return Crossings(spring, summer, autumn, winter)
