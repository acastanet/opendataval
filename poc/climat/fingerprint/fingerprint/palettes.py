"""Palettes par phénomène (spec §14).

Aucune palette unique : la cohérence vient de la structure (cellule claire pour
la classe normale, cinq niveaux, saturation relative identique), pas d'une
couleur imposée partout.
"""
from __future__ import annotations

from .model import CLASS_ORDER

NEUTRAL = "#f2efe9"

PALETTES: dict[str, dict[str, str]] = {
    # bleu ─ neutre ─ rouge
    "temperature": {
        "very_low": "#2c6fad", "low": "#8fbcd9", "near_normal": NEUTRAL,
        "high": "#e08a63", "very_high": "#a92f21",
    },
    # neutre ─ orange ─ rouge sombre
    "utci": {
        "very_low": "#cfd8dc", "low": "#e6dfd2", "near_normal": NEUTRAL,
        "high": "#e8934a", "very_high": "#7f1d14",
    },
    # brun ─ neutre ─ bleu
    "precipitation": {
        "very_low": "#8c6239", "low": "#cbb18a", "near_normal": NEUTRAL,
        "high": "#7fb2d4", "very_high": "#1f5f8b",
    },
    # neutre ─ bleu foncé
    "extreme_rain": {
        "very_low": "#eceae4", "low": "#dfe6ec", "near_normal": NEUTRAL,
        "high": "#6b9dc2", "very_high": "#123f63",
    },
    # neutre ─ ocre ─ brun
    "drought": {
        "very_low": "#e7ece4", "low": "#eae5d6", "near_normal": NEUTRAL,
        "high": "#c9a227", "very_high": "#6b4423",
    },
    # neutre ─ violet / graphite
    "wind": {
        "very_low": "#e9e9ee", "low": "#dcdae4", "near_normal": NEUTRAL,
        "high": "#8b7bb0", "very_high": "#3b3552",
    },
    "snow": {
        "very_low": "#efe9e2", "low": "#e4eaef", "near_normal": NEUTRAL,
        "high": "#9fc6de", "very_high": "#4a7fa5",
    },
}

MISSING = "#ffffff"
MISSING_STROKE = "#cccccc"


def color_for(palette: str, cls: str | None) -> str:
    if cls is None:
        return MISSING
    return PALETTES.get(palette, PALETTES["temperature"]).get(cls, NEUTRAL)


def legend_swatches(palette: str) -> list[tuple[str, str]]:
    p = PALETTES.get(palette, PALETTES["temperature"])
    return [(c, p[c]) for c in CLASS_ORDER]
