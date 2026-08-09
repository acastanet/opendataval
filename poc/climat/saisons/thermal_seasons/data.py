"""Préparation des séries temporelles ERA5-Land pour le calcul des saisons (§5)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .noleap import NOLEAP_DAYS, date_to_noleap_doy, noleap_doy_to_month_day

MIN_HOURLY_PER_DAY = 18          # §5.3 : >= 18 valeurs horaires sur 24
MIN_YEAR_COVERAGE = 0.98        # §5.3 : >= 98 % des jours attendus
MAX_INTERP_GAP = 2              # §5.3 : interpollation des lacunes <= 2 jours


def hourly_to_daily(temperature_c: pd.Series) -> pd.Series:
    """Moyenne arithmétique horaire UTC -> température quotidienne °C (§5.2).

    Un jour n'est valide (§5.3) que s'il possède >= 18 valeurs horaires ; sinon
    il devient NaN et sera traité comme lacune par la suite.
    """
    series = temperature_c
    if not isinstance(series.index, pd.DatetimeIndex):
        raise ValueError("La série doit être indexée par date UTC")
    index = series.index.tz_localize("UTC") if series.index.tz is None else series.index.tz_convert("UTC")
    series = pd.Series(pd.to_numeric(series, errors="coerce").to_numpy(dtype=float), index=index)
    daily_mean = series.resample("1D").mean()
    daily_count = series.resample("1D").count()
    daily_mean = daily_mean.where(daily_count >= MIN_HOURLY_PER_DAY, other=float("nan"))
    return daily_mean


def _interpolate_small_gaps(daily: np.ndarray) -> tuple[np.ndarray, int]:
    """Interpole linéairement les lacunes <= MAX_INTERP_GAP jours (§5.3).

    Retourne (série complétée, nb de jours interpolés).
    """
    filled = daily.copy()
    nan_mask = np.isnan(daily)
    interpolated = 0
    i = 0
    n = len(daily)
    while i < n:
        if nan_mask[i]:
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
        else:
            i += 1
    return filled, interpolated


def _remove_leap_day(daily: pd.Series, year: int) -> tuple[np.ndarray, int, int]:
    """Normalise une année, puis retourne série, jours valides et interpolés."""
    idx = daily[daily.index.year == year]
    arr = np.full(NOLEAP_DAYS, np.nan)
    for ts, value in idx.items():
        if ts.month == 2 and ts.day == 29:
            continue  # suppression du 29 février (§6)
        doy = date_to_noleap_doy(ts.date())
        if np.isnan(value):
            continue
        arr[doy - 1] = value
    valid_days = int(np.isfinite(arr).sum())
    filled, interpolated_days = _interpolate_small_gaps(arr)
    return filled, valid_days, interpolated_days


def prepare_daily_series(hourly_c: pd.Series, years: range) -> dict[int, np.ndarray]:
    """Retourne {année: array(365)} de températures quotidiennes °C no-leap.

    Seules les années ayant >= 98 % de jours valides sont retournées ; les
    autres sont omises (statut traité par le pipeline).
    """
    arrays, _ = prepare_daily_series_with_diagnostics(hourly_c, years)
    return arrays


def prepare_daily_series_with_diagnostics(
    hourly_c: pd.Series, years: range
) -> tuple[dict[int, np.ndarray], dict[int, dict[str, int]]]:
    """Prépare les années et publie les diagnostics de complétude (§5.3).

    Le seuil de 98 % est évalué sur les observations valides avant toute
    interpolation. Les interpolations (au plus deux jours isolés) servent
    uniquement au lissage et ne doivent jamais améliorer artificiellement la
    couverture déclarée.
    """
    daily = hourly_to_daily(hourly_c)
    arrays: dict[int, np.ndarray] = {}
    diagnostics: dict[int, dict[str, int]] = {}
    for year in years:
        arr, valid_days, interpolated_days = _remove_leap_day(daily, year)
        diagnostics[year] = {
            "valid_days": valid_days,
            "interpolated_days": interpolated_days,
        }
        if valid_days >= NOLEAP_DAYS * MIN_YEAR_COVERAGE:
            arrays[year] = arr
    return arrays, diagnostics
