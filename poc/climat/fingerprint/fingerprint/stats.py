"""Percentiles, classification, rangs, tendances robustes (spec §4, §16, §17)."""
from __future__ import annotations

import math
from typing import Iterable, Sequence

import numpy as np

from .model import CLASS_ORDER, ClassName

#: Bornes de la grammaire visuelle Copernicus adaptée (spec §4).
BREAKS = (10.0, 33.3, 66.6, 90.0)


def reference_stats(values: Sequence[float]) -> dict[str, float]:
    """P10/P33.3/P50/P66.6/P90 + moyenne sur la période de référence (spec §18 étape 3)."""
    arr = np.asarray([v for v in values if v is not None], dtype=float)
    arr = arr[~np.isnan(arr)]
    if arr.size == 0:
        return {}
    p10, p33, p50, p66, p90 = np.percentile(arr, [10, 33.3, 50, 66.6, 90])
    return {
        "P10": float(p10), "P33.3": float(p33), "P50": float(p50),
        "P66.6": float(p66), "P90": float(p90),
        "mean": float(arr.mean()), "std": float(arr.std(ddof=1)) if arr.size > 1 else 0.0,
        "n": int(arr.size),
    }


def percentile_of(value: float, ref: Sequence[float]) -> float:
    """Position (0-100) de `value` dans la distribution de référence.

    Interpolation linéaire sur la fonction de répartition empirique : évite les
    paliers grossiers des indicateurs entiers (jours, mois) tout en restant
    borné à [0, 100].
    """
    arr = np.sort(np.asarray([v for v in ref if v is not None], dtype=float))
    arr = arr[~np.isnan(arr)]
    n = arr.size
    if n == 0 or value is None or (isinstance(value, float) and math.isnan(value)):
        return float("nan")
    below = float(np.count_nonzero(arr < value))
    equal = float(np.count_nonzero(arr == value))
    # Définition "mid-rank" : robuste aux ex aequo fréquents sur les comptages.
    return 100.0 * (below + 0.5 * equal) / n


def classify(pct: float) -> ClassName | None:
    """Cinq classes issues des bornes de la référence (spec §4)."""
    if pct is None or math.isnan(pct):
        return None
    p10, p33, p66, p90 = BREAKS
    if pct <= p10:
        return "very_low"
    if pct <= p33:
        return "low"
    if pct < p66:
        return "near_normal"
    if pct < p90:
        return "high"
    return "very_high"


def ranks(values: Sequence[float | None], descending: bool = True) -> list[int | None]:
    """Rang de chaque année parmi les 30 de l'empreinte (1 = plus extrême)."""
    idx = [i for i, v in enumerate(values) if v is not None and not math.isnan(v)]
    out: list[int | None] = [None] * len(values)
    order = sorted(idx, key=lambda i: values[i], reverse=descending)
    for rank, i in enumerate(order, start=1):
        out[i] = rank
    return out


def theil_sen(years: Sequence[int], values: Sequence[float]) -> dict[str, float]:
    """Pente robuste de Theil-Sen (médiane des pentes deux à deux)."""
    x = np.asarray(years, dtype=float)
    y = np.asarray(values, dtype=float)
    mask = ~np.isnan(y)
    x, y = x[mask], y[mask]
    if x.size < 3:
        return {}
    slopes = []
    for i in range(x.size - 1):
        dx = x[i + 1:] - x[i]
        slopes.append((y[i + 1:] - y[i])[dx != 0] / dx[dx != 0])
    s = np.concatenate(slopes)
    slope = float(np.median(s))
    lo, hi = np.percentile(s, [2.5, 97.5])
    return {
        "slope_per_year": slope,
        "slope_per_decade": slope * 10.0,
        "ci95_low_per_decade": float(lo) * 10.0,
        "ci95_high_per_decade": float(hi) * 10.0,
        "intercept": float(np.median(y - slope * x)),
    }


def mann_kendall(values: Sequence[float]) -> dict[str, float | str]:
    """Test de tendance de Mann-Kendall avec correction des ex aequo."""
    y = np.asarray([v for v in values if v is not None], dtype=float)
    y = y[~np.isnan(y)]
    n = y.size
    if n < 8:
        return {"verdict": "indeterminate", "n": int(n)}
    s = 0
    for k in range(n - 1):
        s += int(np.sum(np.sign(y[k + 1:] - y[k])))
    _, counts = np.unique(y, return_counts=True)
    tie_term = float(np.sum(counts * (counts - 1) * (2 * counts + 5)))
    var = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    if var <= 0:
        return {"verdict": "indeterminate", "n": int(n)}
    if s > 0:
        z = (s - 1) / math.sqrt(var)
    elif s < 0:
        z = (s + 1) / math.sqrt(var)
    else:
        z = 0.0
    p = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0))))
    return {"S": float(s), "Z": float(z), "p_value": float(p), "n": int(n),
            "verdict": trend_verdict(p, z)}


def trend_verdict(p_value: float, z: float) -> str:
    """Formulation prudente destinée au moteur éditorial (spec §17)."""
    if p_value < 0.05:
        return "tendance nette"
    if p_value < 0.20:
        return "évolution possible mais variable"
    return "aucune tendance claire sur la période"


def decade_delta(years: Sequence[int], values: Sequence[float | None],
                 early: tuple[int, int], late: tuple[int, int]) -> dict[str, float | None]:
    """Différence moyenne dernière décennie − première décennie (spec §16)."""
    def mean_of(lo: int, hi: int) -> float | None:
        sel = [v for yr, v in zip(years, values)
               if lo <= yr <= hi and v is not None and not math.isnan(v)]
        return float(np.mean(sel)) if sel else None

    a, b = mean_of(*early), mean_of(*late)
    if a is None or b is None:
        return {"early_mean": a, "late_mean": b, "delta": None, "delta_pct": None}
    return {
        "early_mean": a,
        "late_mean": b,
        "delta": b - a,
        "delta_pct": (b - a) / a * 100.0 if a != 0 else None,
    }
