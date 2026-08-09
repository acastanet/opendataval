"""Climatologie de référence 1991–2020 et seuils T25/T75 (§7)."""

from __future__ import annotations

import numpy as np

from .noleap import NOLEAP_DAYS

REFERENCE_PERIOD = (1991, 2020)
PERCENTILE_METHOD = "linear"


def build_climatology(daily_by_year: dict[int, np.ndarray]) -> np.ndarray:
    """Moyenne quotidienne sur les années de référence.

    ``daily_by_year`` mappe ``année -> array(365)`` de températures quotidiennes
    °C (valeurs no-leap). Seules les années comprises dans 1991–2020 et de
    longueur 365 sont retenues.

    Retourne un array(365) : la climatologie quotidienne du lieu.
    """
    years = sorted(
        y
        for y, arr in daily_by_year.items()
        if REFERENCE_PERIOD[0] <= y <= REFERENCE_PERIOD[1]
        and np.ndim(arr) == 1
        and arr.size == NOLEAP_DAYS
    )
    if not years:
        raise ValueError("Aucune année de référence 1991–2020 disponible")
    # nanmean tolère quelques jours manquants par année (≤2) sans fausser la
    # climatologie quotidienne sur 30 ans (≈1 % de données ignorées au pire).
    stack = np.vstack([np.asarray(daily_by_year[y], dtype=float) for y in years])
    return np.nanmean(stack, axis=0)


def compute_thresholds(climatology: np.ndarray) -> tuple[float, float]:
    """T25/T75 = percentiles 25/75 de la climatologie quotidienne (méthode linéaire)."""
    clim = np.asarray(climatology, dtype=float)
    if clim.size != NOLEAP_DAYS:
        raise ValueError("La climatologie doit contenir 365 valeurs")
    t25 = float(np.percentile(clim, 25, method=PERCENTILE_METHOD))
    t75 = float(np.percentile(clim, 75, method=PERCENTILE_METHOD))
    return t25, t75
