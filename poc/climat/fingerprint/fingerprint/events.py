"""Détection et sélection des événements exceptionnels (spec §13)."""
from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

from .model import Event

MAX_PER_FAMILY = 2
MAX_TOTAL = 8

#: Vocabulaire prudent imposé par la spec §13.4 — aucun terme d'impact.
FAMILY_LABELS = {
    "heat": "stress thermique exceptionnel",
    "heavy_rain": "épisode de pluie extrême",
    "drought": "séquence de sécheresse",
    "wind": "épisode de vent extrême",
    "cold": "froid exceptionnel",
    "snow": "enneigement exceptionnel",
}

FAMILY_MARKER = {
    "heat": "triangle", "heavy_rain": "circle", "drought": "diamond",
    "wind": "square", "cold": "triangle-down", "snow": "hexagon",
}


def _pct_rank(value: float, ref: Sequence[float]) -> float:
    arr = np.asarray(ref, dtype=float)
    arr = arr[~np.isnan(arr)]
    if arr.size == 0:
        return float("nan")
    return 100.0 * float(np.count_nonzero(arr < value)) / arr.size


def detect_daily_extremes(
    dates: Sequence[str],
    values: Sequence[float],
    ref_mask: Sequence[bool],
    family: str,
    threshold_pct: float = 99.0,
    min_gap_days: int = 5,
) -> list[Event]:
    """Candidats quotidiens dépassant un percentile élevé de la référence.

    `ref_mask[i]` indique que la date i appartient à la période de référence.
    Les jours consécutifs (à `min_gap_days` près) sont fusionnés en un épisode.
    """
    v = np.asarray(values, dtype=float)
    ref = v[np.asarray(ref_mask, dtype=bool)]
    ref = ref[~np.isnan(ref)]
    if ref.size == 0:
        return []
    thr = float(np.percentile(ref, threshold_pct))

    hits = [i for i, x in enumerate(v) if not math.isnan(x) and x > thr]
    if not hits:
        return []

    episodes: list[list[int]] = [[hits[0]]]
    for i in hits[1:]:
        if i - episodes[-1][-1] <= min_gap_days:
            episodes[-1].append(i)
        else:
            episodes.append([i])

    out: list[Event] = []
    for ep in episodes:
        peak = max(ep, key=lambda i: v[i])
        out.append(Event(
            date_start=dates[ep[0]],
            date_end=dates[ep[-1]],
            family=family,
            severity_percentile=round(_pct_rank(v[peak], ref), 2),
            metrics={
                "peak_value": float(v[peak]),
                "peak_date": dates[peak],
                "reference_threshold": thr,
                "threshold_percentile": threshold_pct,
                "duration_days": int(ep[-1] - ep[0] + 1),
            },
            label=FAMILY_LABELS.get(family, family),
        ))
    return out


def detect_drought_sequences(
    months: Sequence[str],
    spei3: Sequence[float],
    p10_by_month: dict[int, float],
    min_length: int = 3,
) -> list[Event]:
    """Séquences de mois consécutifs sous le P10 mensuel de la référence (spec §13.2)."""
    below = []
    for m, v in zip(months, spei3):
        if v is None or math.isnan(v):
            below.append(False)
            continue
        thr = p10_by_month.get(int(m[5:7]))
        below.append(thr is not None and v < thr)

    out: list[Event] = []
    i = 0
    while i < len(below):
        if not below[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(below) and below[j + 1]:
            j += 1
        length = j - i + 1
        if length >= min_length:
            seq = [spei3[k] for k in range(i, j + 1)]
            worst = float(np.nanmin(seq))
            # Sévérité : combinaison durée × intensité, ramenée sur une échelle 0-100.
            severity = min(99.9, 90.0 + length + abs(worst))
            out.append(Event(
                date_start=f"{months[i]}-01",
                date_end=f"{months[j]}-28",
                family="drought",
                severity_percentile=round(severity, 2),
                metrics={"length_months": length, "spei3_min": worst},
                label=FAMILY_LABELS["drought"],
            ))
        i = j + 1
    return out


def select_events(candidates: Sequence[Event],
                  max_per_family: int = MAX_PER_FAMILY,
                  max_total: int = MAX_TOTAL) -> list[Event]:
    """Sélection favorisant la diversité des familles (spec §13.3).

    On ne retient pas simplement les N valeurs les plus extrêmes : on parcourt
    les familles en tourniquet pour qu'une famille très bruyante (pluie) ne
    masque pas les autres signaux.
    """
    by_family: dict[str, list[Event]] = {}
    for e in candidates:
        by_family.setdefault(e.family, []).append(e)
    for fam in by_family:
        by_family[fam].sort(key=lambda e: e.severity_percentile, reverse=True)

    selected: list[Event] = []
    for slot in range(max_per_family):
        # Familles ordonnées par la sévérité de leur meilleur candidat restant.
        fams = sorted(
            (f for f, lst in by_family.items() if len(lst) > slot),
            key=lambda f: by_family[f][slot].severity_percentile,
            reverse=True,
        )
        for f in fams:
            if len(selected) >= max_total:
                break
            selected.append(by_family[f][slot])
        if len(selected) >= max_total:
            break

    selected.sort(key=lambda e: e.date_start)
    return selected
