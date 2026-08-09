"""Lissage polynomial de degré 3 d'une année (§8).

Le polynôme ne sert qu'à repérer les dates de franchissement de seuils ; il ne
remplace jamais les données physiques dans les autres parties du produit.
"""

from __future__ import annotations

import numpy as np

from .noleap import NOLEAP_DAYS


def smooth_annual(series_c: np.ndarray) -> np.ndarray:
    """Ajuste un polynôme de degré 3 sur la séquence quotidienne 1..365.

    ``series_c`` : array(365) de températures quotidiennes °C (peut contenir
    des NaN pour les jours manquants). Retourne l'array(365) lissé.
    """
    x = np.arange(1, NOLEAP_DAYS + 1, dtype=float)
    y = np.asarray(series_c, dtype=float)
    valid = ~np.isnan(y)
    if valid.sum() < 4:
        # Insuffisant pour un polynôme de degré 3 : on renvoie du NaN.
        return np.full(NOLEAP_DAYS, np.nan)
    coeffs = np.polyfit(x[valid], y[valid], 3)
    return np.polyval(coeffs, x)


def fit_rmse(smoothed: np.ndarray, original: np.ndarray) -> float:
    """RMSE (°C) entre la courbe lissée et les données quotidiennes."""
    s = np.asarray(smoothed, dtype=float)
    o = np.asarray(original, dtype=float)
    valid = ~(np.isnan(s) | np.isnan(o))
    if valid.sum() < 2:
        return float("nan")
    return float(np.sqrt(np.mean((o[valid] - s[valid]) ** 2)))
