"""Géométrie pure de la roue des saisons : DOY <-> angle, arcs, dates.

Aucune dépendance SVG ici. Toutes les fonctions sont des transformations
mathématiques vérifiables indépendamment du rendu (voir tests/test_wheel_geometry.py).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

NOLEAP_DAYS = 365

# Calendrier no-leap : jours cumulés en fin de chaque mois (index 0 = avant janvier).
CUMULATIVE_MONTH_DAYS = (0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365)

MONTHS_FR_ABBR = (
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
)
MONTHS_FR_INITIAL = ("J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D")

SEASON_ORDER = ("winter", "spring", "summer", "autumn")
SEASON_BOUNDARY_KEY = {
    "winter": "winter_start",
    "spring": "spring_start",
    "summer": "summer_start",
    "autumn": "autumn_start",
}
BOUNDARY_KEYS = ("spring_start", "summer_start", "autumn_start", "winter_start")


def normalize_delta(delta_deg: float) -> float:
    """Ramène un écart angulaire dans l'intervalle [-180, 180)."""

    return ((delta_deg + 180.0) % 360.0) - 180.0


def angle_from_doy(doy: float, top_doy: float, year_days: int = NOLEAP_DAYS, clockwise: bool = True) -> float:
    """Convertit un jour de l'année (1..year_days) en angle (0° = top_doy, horaire par défaut)."""

    raw = ((doy - top_doy) % year_days) / year_days * 360.0
    return raw if clockwise else (360.0 - raw) % 360.0


def doy_from_angle(angle_deg: float, top_doy: float, year_days: int = NOLEAP_DAYS, clockwise: bool = True) -> float:
    """Réciproque de :func:`angle_from_doy`."""

    a = angle_deg if clockwise else (360.0 - angle_deg) % 360.0
    doy = top_doy + (a % 360.0) / 360.0 * year_days
    doy = doy % year_days
    return doy if doy > 0 else doy + year_days


def polar_point(cx: float, cy: float, radius: float, angle_deg: float) -> tuple[float, float]:
    """Point sur le cercle de rayon ``radius`` à l'angle ``angle_deg`` (0° = haut, horaire)."""

    rad = math.radians(angle_deg)
    return cx + radius * math.sin(rad), cy - radius * math.cos(rad)


def tangent_vector(angle_deg: float, clockwise: bool = True) -> tuple[float, float]:
    """Vecteur unitaire tangent au cercle à ``angle_deg``, dans le sens de parcours donné."""

    rad = math.radians(angle_deg)
    vector = (math.cos(rad), math.sin(rad))
    if clockwise:
        return vector
    return (-vector[0], -vector[1])


def format_date(doy: float, rounding: str = "nearest") -> str:
    """Formate un DOY (calendrier no-leap 365 j) en date française courte, ex. « 28 févr. »."""

    if rounding == "nearest":
        day_number = int(round(doy))
    elif rounding == "floor":
        day_number = int(math.floor(doy))
    else:
        raise ValueError(f"rounding inconnu : {rounding!r}")
    day_number = max(1, min(NOLEAP_DAYS, day_number))
    for month_index in range(12):
        if day_number <= CUMULATIVE_MONTH_DAYS[month_index + 1]:
            day_of_month = day_number - CUMULATIVE_MONTH_DAYS[month_index]
            return f"{day_of_month} {MONTHS_FR_ABBR[month_index]}"
    raise AssertionError("day_number hors bornes après clamp")


def arc_dash(radius: float, start_deg: float, sweep_deg: float) -> tuple[str, float]:
    """Calcule (stroke-dasharray, stroke-dashoffset) pour un arc sur un ``<circle>`` de rayon
    ``radius``, le groupe parent devant porter ``transform="rotate(-90 cx cy)"`` pour que
    l'angle natif du cercle (0° = 3 h) coïncide avec notre convention (0° = haut, horaire).
    """

    circumference = 2 * math.pi * radius
    sweep = max(0.0, min(360.0, sweep_deg))
    length = circumference * sweep / 360.0
    gap = circumference - length
    dashoffset = -(circumference * start_deg / 360.0)
    return f"{length:.3f} {gap:.3f}", dashoffset


@dataclass(frozen=True)
class SeasonSpan:
    name: str
    start_doy: float
    end_doy: float
    duration_days: float
    start_angle: float
    sweep_deg: float


def season_spans(
    boundaries: dict[str, float],
    top_doy: float,
    year_days: int = NOLEAP_DAYS,
    clockwise: bool = True,
) -> list[SeasonSpan]:
    """Les 4 arcs de saison d'une décennie, dans l'ordre hiver/printemps/été/automne."""

    spans: list[SeasonSpan] = []
    for index, name in enumerate(SEASON_ORDER):
        start_doy = boundaries[SEASON_BOUNDARY_KEY[name]]
        next_name = SEASON_ORDER[(index + 1) % 4]
        end_doy = boundaries[SEASON_BOUNDARY_KEY[next_name]]
        duration = (end_doy - start_doy) % year_days
        start_angle = angle_from_doy(start_doy, top_doy, year_days, clockwise)
        spans.append(SeasonSpan(name, start_doy, end_doy, duration, start_angle, duration / year_days * 360.0))
    return spans


@dataclass(frozen=True)
class ShiftSpan:
    boundary: str
    early_doy: float
    late_doy: float
    shift_days: float
    early_angle: float
    late_angle: float
    start_angle: float
    sweep_deg: float
    clockwise_sweep: bool
    warm_expansion: bool


# Pour chaque frontière, un décalage dans ce sens correspond à une extension de la
# période chaude (été qui déborde sur les saisons voisines).
_WARM_EXPANSION_SIGN = {
    "spring_start": -1.0,
    "summer_start": -1.0,
    "autumn_start": 1.0,
    "winter_start": 1.0,
}


def shift_spans(
    early_boundaries: dict[str, float],
    late_boundaries: dict[str, float],
    top_doy: float,
    year_days: int = NOLEAP_DAYS,
    clockwise: bool = True,
) -> list[ShiftSpan]:
    """Les 4 zones de décalage (limite ancienne -> limite récente), une par frontière."""

    spans: list[ShiftSpan] = []
    for key in BOUNDARY_KEYS:
        early_doy = early_boundaries[key]
        late_doy = late_boundaries[key]
        shift_days = late_doy - early_doy
        early_angle = angle_from_doy(early_doy, top_doy, year_days, clockwise)
        late_angle = angle_from_doy(late_doy, top_doy, year_days, clockwise)
        raw_delta = normalize_delta(late_angle - early_angle)
        clockwise_sweep = raw_delta >= 0
        sweep_deg = abs(raw_delta)
        start_angle = early_angle if clockwise_sweep else late_angle
        warm_expansion = (shift_days * _WARM_EXPANSION_SIGN[key]) > 0
        spans.append(
            ShiftSpan(
                boundary=key,
                early_doy=early_doy,
                late_doy=late_doy,
                shift_days=shift_days,
                early_angle=early_angle,
                late_angle=late_angle,
                start_angle=start_angle,
                sweep_deg=sweep_deg,
                clockwise_sweep=clockwise_sweep,
                warm_expansion=warm_expansion,
            )
        )
    return spans


def unwrap_towards(reference_deg: float, angle_deg: float) -> float:
    """Retourne un angle équivalent à ``angle_deg`` (mod 360), le plus proche de ``reference_deg``.

    Utilisé pour les interpolations CSS (rotate(), dashoffset) afin qu'une animation
    parcoure toujours le plus court chemin angulaire plutôt qu'un tour complet.
    """

    return reference_deg + normalize_delta(angle_deg - reference_deg)


def compute_horizontal_top_doy(
    boundaries: dict[str, float], year_days: int = NOLEAP_DAYS, clockwise: bool = True
) -> float:
    """Calcule le ``top_doy`` qui place le milieu de l'été et le milieu de l'hiver de
    cette décennie sur une même ligne horizontale, été à gauche (convention « papillon »).

    Deux points d'un cercle sont à la même hauteur (même y) quand leurs angles se
    somment à 360°. Il existe deux rotations qui satisfont cette égalité, opposées de
    182,5 j ; on retient celle qui place l'été dans la moitié gauche (angle > 180°).
    """

    summer_mid = (boundaries["summer_start"] + boundaries["autumn_start"]) / 2.0
    winter_mid = ((boundaries["winter_start"] + boundaries["spring_start"] + year_days) / 2.0) % year_days
    half = year_days / 2.0
    base = ((summer_mid + winter_mid) / 2.0) % half
    for candidate in (base, base + half):
        if angle_from_doy(summer_mid, candidate, year_days, clockwise) > 180.0:
            return candidate
    return base
