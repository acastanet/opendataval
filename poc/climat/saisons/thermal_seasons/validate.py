"""Validation scientifique et contrôle secondaire saison de croissance >5 °C (§24–§25)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .noleap import NOLEAP_DAYS


@dataclass(frozen=True)
class GrowingSeason:
    start: float | None
    end: float | None
    length: float | None


def growing_season_5c(daily_c: np.ndarray) -> GrowingSeason:
    """Premier épisode de 5 jours consécutifs > 5 °C, puis retour < 5 °C (§24).

    Entrée : array(365) de température quotidienne °C (NaN toléré). Retourne les
    DOY flottants (interpolation linéaire au franchissement) et la longueur.
    """
    s = np.asarray(daily_c, dtype=float)
    warm = ~np.isnan(s)
    above = (s > 5.0) & warm

    start = None
    for d in range(1, NOLEAP_DAYS - 3):  # DOY de début ; besoin de 5 jours
        window = above[d - 1 : d + 4]
        if window.all():
            # Une interpolation n'est valable que si le seuil est réellement
            # encadré par le jour précédent et le premier jour de l'épisode.
            if d == 1 or np.isnan(s[d - 2]) or np.isnan(s[d - 1]) or not (s[d - 2] <= 5.0 < s[d - 1]):
                start = float(d)
            else:
                frac = (5.0 - s[d - 2]) / (s[d - 1] - s[d - 2])
                start = float((d - 1) + frac)
            break
    if start is None:
        return GrowingSeason(None, None, None)

    # Premier retour durable : 5 jours consécutifs < 5 °C après l'épisode chaud.
    end = None
    first_possible_end = max(1, int(np.ceil(start)) + 5)
    for d in range(first_possible_end, NOLEAP_DAYS - 3):
        window = ~above[d - 1 : d + 4]
        if window.all():
            if d == 1 or np.isnan(s[d - 2]) or np.isnan(s[d - 1]) or not (s[d - 2] >= 5.0 > s[d - 1]):
                end = float(d)
            else:
                frac = (5.0 - s[d - 2]) / (s[d - 1] - s[d - 2])
                end = float((d - 1) + frac)
            break
    length = (end - start) if end is not None and end > start else None
    return GrowingSeason(start, end, length)


@dataclass(frozen=True)
class QAResult:
    ok: bool
    reason: str | None


def qa_annual(crossings, durations) -> QAResult:
    """Vérifie l'ordre saisonnier et des durées positives (§25).

    Rejette uniquement si : données insuffisantes, calcul impossible, ou ordre
    saisonnier invalide. Une année atypique reste conservée tant que l'ordre
    spring < summer < autumn < winter tient.
    """
    if crossings is None:
        return QAResult(False, "invalid_crossings")
    c = crossings
    if not (1.0 <= c.spring_start < c.summer_start < c.autumn_start < c.winter_start <= NOLEAP_DAYS):
        return QAResult(False, "invalid_crossings")
    if durations is None:
        return QAResult(True, None)
    if (durations.spring_length is not None and durations.spring_length <= 0) or \
       (durations.summer_length is not None and durations.summer_length <= 0) or \
       (durations.autumn_length is not None and durations.autumn_length <= 0):
        return QAResult(False, "non_positive_length")
    return QAResult(True, None)
