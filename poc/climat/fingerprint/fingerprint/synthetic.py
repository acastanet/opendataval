"""Séries fictives réalistes pour valider le rendu (spec §26 étape 1).

AUCUNE de ces valeurs n'est un résultat climatique réel. Elles servent
uniquement à éprouver la géométrie, les palettes et la détection d'événements.
"""
from __future__ import annotations

import numpy as np

from .events import Event, detect_daily_extremes, detect_drought_sequences, select_events
from .model import REF_END, REF_START


def synthetic_annual(seed: int = 42, y0: int = REF_START, y1: int = 2025):
    """Retourne (annual, extras, events) avec une tendance de réchauffement plausible."""
    rng = np.random.default_rng(seed)
    years = list(range(y0, y1 + 1))
    t = np.array([(y - y0) for y in years], dtype=float)

    temp = 13.0 + 0.042 * t + rng.normal(0, 0.45, t.size)
    utci = 30.5 + 0.055 * t + rng.normal(0, 0.9, t.size)
    precip = 980 + rng.normal(0, 190, t.size) - 1.2 * t
    precip = np.clip(precip, 350, None)
    xrain = np.clip(rng.poisson(6, t.size) + 0.06 * t + rng.normal(0, 1.2, t.size), 0, None)
    drought = np.clip(rng.poisson(1.6, t.size) + 0.07 * t, 0, 12)
    wind = np.clip(rng.poisson(7, t.size) + rng.normal(0, 1.5, t.size), 0, None)

    annual = {
        "temperature": {y: float(v) for y, v in zip(years, temp)},
        "utci": {y: float(v) for y, v in zip(years, utci)},
        "precipitation": {y: float(v) for y, v in zip(years, precip)},
        "extreme_rain": {y: float(round(v)) for y, v in zip(years, xrain)},
        "drought": {y: float(round(v)) for y, v in zip(years, drought)},
        "wind": {y: float(round(v)) for y, v in zip(years, wind)},
    }

    extras = {
        "utci": {y: {"jours >= 32 degC UTCI": int(max(0, round(v - 24))),
                     "jours >= 38 degC UTCI": int(max(0, round(v - 31)))}
                 for y, v in zip(years, utci)},
        "precipitation": {y: {"jours de pluie": int(80 + rng.integers(-15, 15))}
                          for y in years},
        "extreme_rain": {y: {"R95pTOT (mm)": int(v * 38 + rng.integers(-40, 40))}
                         for y, v in zip(years, xrain)},
        "drought": {y: {"SPEI-3 minimum": round(float(-0.8 - 0.18 * v), 2)}
                    for y, v in zip(years, drought)},
        "wind": {y: {"max quotidien (m/s)": round(float(18 + rng.normal(0, 3)), 1)}
                 for y in years},
    }

    events = _synthetic_events(rng, y0, y1)
    return annual, extras, events


def _synthetic_events(rng, y0: int, y1: int) -> list[Event]:
    n_days = (y1 - y0 + 1) * 365
    dates, ref_mask = [], []
    for k in range(n_days):
        y = y0 + k // 365
        doy = k % 365
        m = min(12, doy // 31 + 1)
        d = min(28, doy % 28 + 1)
        dates.append(f"{y}-{m:02d}-{d:02d}")
        ref_mask.append(REF_START <= y <= REF_END)

    trend = np.linspace(0, 1.6, n_days)
    season = 8 * np.sin(np.arange(n_days) / 365.0 * 2 * np.pi - 1.4)
    heat = 22 + season + trend + rng.normal(0, 3.2, n_days)
    rain = np.clip(rng.gamma(0.45, 6.0, n_days) - 1.0, 0, None)
    wind = np.clip(14 + rng.gumbel(0, 3.0, n_days), 0, None)

    cands: list[Event] = []
    cands += detect_daily_extremes(dates, heat, ref_mask, "heat", 99.5)
    cands += detect_daily_extremes(dates, rain, ref_mask, "heavy_rain", 99.5)
    cands += detect_daily_extremes(dates, wind, ref_mask, "wind", 99.5)

    months = [f"{y}-{m:02d}" for y in range(y0, y1 + 1) for m in range(1, 13)]
    spei = rng.normal(0, 1, len(months)) - np.linspace(0, 0.55, len(months))
    p10 = {m: -1.35 for m in range(1, 13)}
    cands += detect_drought_sequences(months, list(spei), p10)

    return select_events(cands)
