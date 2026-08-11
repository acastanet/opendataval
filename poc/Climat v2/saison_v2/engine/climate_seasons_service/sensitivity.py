from __future__ import annotations

from typing import Callable

import numpy as np

from .science import NOLEAP_DAYS, Crossings, detect_crossings, smooth_annual

Smoother = Callable[[np.ndarray], np.ndarray]


def _validated_series(series_c: np.ndarray) -> np.ndarray:
    values = np.asarray(series_c, dtype=float)
    if values.ndim != 1 or values.size != NOLEAP_DAYS:
        raise ValueError("La série annuelle doit contenir 365 valeurs")
    return values


def smooth_harmonic(series_c: np.ndarray, harmonics: int = 2) -> np.ndarray:
    """Ajustement circulaire par moindres carrés sur 1 ou plusieurs harmoniques."""
    values = _validated_series(series_c)
    if harmonics < 1:
        raise ValueError("harmonics doit être >= 1")
    x = np.arange(NOLEAP_DAYS, dtype=float)
    columns = [np.ones(NOLEAP_DAYS, dtype=float)]
    for harmonic in range(1, harmonics + 1):
        angle = 2.0 * np.pi * harmonic * x / NOLEAP_DAYS
        columns.extend((np.sin(angle), np.cos(angle)))
    design = np.column_stack(columns)
    valid = np.isfinite(values)
    if int(valid.sum()) < design.shape[1]:
        return np.full(NOLEAP_DAYS, np.nan)
    coefficients, *_ = np.linalg.lstsq(design[valid], values[valid], rcond=None)
    return design @ coefficients


def smooth_circular_moving_average(series_c: np.ndarray, window: int = 31) -> np.ndarray:
    """Moyenne mobile centrée et circulaire, sans effet de bord décembre/janvier."""
    values = _validated_series(series_c)
    if window < 3 or window % 2 == 0 or window > NOLEAP_DAYS:
        raise ValueError("window doit être impair, >= 3 et <= 365")
    radius = window // 2
    extended = np.concatenate((values[-radius:], values, values[:radius]))
    result = np.empty(NOLEAP_DAYS, dtype=float)
    for index in range(NOLEAP_DAYS):
        segment = extended[index : index + window]
        finite = segment[np.isfinite(segment)]
        result[index] = float(np.mean(finite)) if finite.size else np.nan
    return result


def crossing_sensitivity(
    series_c: np.ndarray,
    t25: float,
    t75: float,
) -> dict[str, Crossings | None]:
    """Compare les frontières obtenues avec les trois lissages de l'audit P9."""
    values = _validated_series(series_c)
    return {
        "polynomial_degree_3": detect_crossings(smooth_annual(values), t25, t75),
        "harmonic_2": detect_crossings(smooth_harmonic(values, harmonics=2), t25, t75),
        "moving_average_31d": detect_crossings(smooth_circular_moving_average(values, window=31), t25, t75),
    }


def max_crossing_spread_days(crossings: dict[str, Crossings | None]) -> float | None:
    valid = [item for item in crossings.values() if item is not None]
    if len(valid) < 2:
        return None
    spreads = []
    for field in ("spring_start", "summer_start", "autumn_start", "winter_start"):
        values = [float(getattr(item, field)) for item in valid]
        spreads.append(max(values) - min(values))
    return float(max(spreads))
