"""Calendrier sans 29 février (année de 365 jours).

Tous les calculs saisonniers travaillent sur une année normalisée à 365 jours
(§6). Les deux fonctions ci-dessous sont les seules autorisées à convertir
entre dates réelles et DOY no-leap ; elles sont testées explicitement.
"""

from __future__ import annotations

from datetime import date

NOLEAP_DAYS = 365

# Cumul des jours par mois dans une année sans 29 février (février = 28 jours).
_MONTH_LENGTHS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
_CUMULATIVE = [0]
for _length in _MONTH_LENGTHS:
    _CUMULATIVE.append(_CUMULATIVE[-1] + _length)
# _CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]


def _is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def date_to_noleap_doy(d: date) -> int:
    """Retourne le jour de l'année 1..365 sans compter le 29 février.

    Le 29 février est supprimé (§6) : il est simplement ignoré et la fonction
    lève une ValueError seulement si on tente de le convertir explicitement hors
    contexte. Dans le pipeline, les jours 29/02 sont filtrés avant appel.
    """
    month, day = d.month, d.day
    if month == 2 and day == 29:
        raise ValueError("Le 29 février n'existe pas dans le calendrier no-leap")
    doy = _CUMULATIVE[month - 1] + day
    if _is_leap(d.year) and (month > 2):
        doy -= 1
    return doy


def noleap_doy_to_month_day(doy: int) -> str:
    """Retourne 'MM-DD' pour un DOY 1..365 no-leap."""
    if not 1 <= doy <= NOLEAP_DAYS:
        raise ValueError("DOY no-leap hors bornes (1..365)")
    month = 1
    while month <= 12 and _CUMULATIVE[month] < doy:
        month += 1
    day = doy - _CUMULATIVE[month - 1]
    return f"{month:02d}-{day:02d}"


def month_day_to_doy(month: int, day: int) -> int:
    """Inverse de noleap_doy_to_month_day (utile pour les fenêtres de saison)."""
    if not 1 <= month <= 12:
        raise ValueError("Mois hors bornes (1..12)")
    if not 1 <= day <= _MONTH_LENGTHS[month - 1]:
        raise ValueError("Jour hors bornes pour ce mois (calendrier no-leap)")
    return _CUMULATIVE[month - 1] + day
