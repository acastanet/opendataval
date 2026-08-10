"""Rendu SVG natif de « Les saisons se déplacent ».

Le renderer lit uniquement le payload scientifique déjà calculé. Il ne détecte
aucun franchissement, ne recalcule aucun seuil et ne modifie aucune valeur.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

NOLEAP_DAYS = 365

SEASON_COLORS = {
    "winter": "#8DEBFF",
    "spring": "#FF9FC7",
    "summer": "#C7F36B",
    "autumn": "#FFC45C",
}
SEASON_ORDER = ["winter", "spring", "summer", "autumn", "winter"]
SEASON_LABELS = ["HIVER", "PRINTEMPS", "ÉTÉ", "AUTOMNE", "HIVER"]

BG_COLOR = "#C5C4C1"
SHADOW_COLOR = "#1C2529"
UNCERTAINTY_FILL = "#AEB7B3"
UNCERTAINTY_STROKE = "#69756F"
MEDIAN_COLOR = "#C83D3D"
SEASON_OPACITY = "0.84"

TRANSITION_GRADIENT = {
    ("winter", "spring"): "grad-winter-spring",
    ("spring", "summer"): "grad-spring-summer",
    ("summer", "autumn"): "grad-summer-autumn",
    ("autumn", "winter"): "grad-autumn-winter",
}

WIDTH = 1000
HEIGHT = 286
LEFT = 80
PLOT_WIDTH = 720
MONTHS_TOP = 112
EARLY_TOP = 160
LATE_TOP = 208
BAND_HEIGHT = 32
SIG_X = LEFT + PLOT_WIDTH + 24

MONTHS = ["JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC"]
_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_DOY_START = [1]
for _length in _MONTH_LENGTHS:
    _DOY_START.append(_DOY_START[-1] + _length)


class ThermalSeasonsRenderError(ValueError):
    pass


def _x(doy: float, left: float = LEFT, plot_width: float = PLOT_WIDTH) -> float:
    return left + (doy - 1) / (NOLEAP_DAYS - 1) * plot_width


def _medians(dec: Mapping[str, Any] | None) -> list[float] | None:
    if not dec:
        return None
    keys = ["spring_start", "summer_start", "autumn_start", "winter_start"]
    meds = [dec.get(key, {}).get("median") for key in keys]
    if any(value is None for value in meds):
        return None
    return [float(value) for value in meds]


def _shift_text(value: object, *, subject: str) -> str | None:
    if not isinstance(value, (int, float)):
        return None
    days = int(round(abs(float(value))))
    if days == 0:
        return f"{subject} : stable"
    direction = "plus tôt" if float(value) < 0 else "plus tard"
    return f"{subject} : {days} j {direction}"


def render_thermal_seasons_svg(document: Mapping[str, Any]) -> str:
    """Rend le payload thermal-seasons V1 selon visualization.md."""
    decades = document.get("decades")
    if not isinstance(decades, Mapping):
        raise ThermalSeasonsRenderError("Le payload doit contenir decades")
    early = decades.get("1996-2005", {})
    late = decades.get("2016-2025", {})
    if not isinstance(early, Mapping) or not isinstance(late, Mapping):
        raise ThermalSeasonsRenderError("Les décennies early/late doivent être des objets")

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        'role="img" aria-labelledby="thermal-seasons-title thermal-seasons-desc">',
        '<title id="thermal-seasons-title">Les saisons thermiques se déplacent</title>',
        '<desc id="thermal-seasons-desc">Deux calendriers thermiques locaux comparés sur la même année. '
        'Les frontières sont définies par T25 et T75 ; les zones autour des frontières montrent P25–P75.</desc>',
        '<defs>',
        '<filter id="soft-shadow" x="-5%" y="-5%" width="110%" height="120%">',
        f'<feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="{SHADOW_COLOR}" flood-opacity="0.20"/>',
        '</filter>',
        '<linearGradient id="grad-winter-spring" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["winter"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["spring"]}" stop-opacity="0.78"/></linearGradient>',
        '<linearGradient id="grad-spring-summer" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["spring"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["summer"]}" stop-opacity="0.78"/></linearGradient>',
        '<linearGradient id="grad-summer-autumn" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["summer"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["autumn"]}" stop-opacity="0.78"/></linearGradient>',
        '<linearGradient id="grad-autumn-winter" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["autumn"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["winter"]}" stop-opacity="0.78"/></linearGradient>',
        '</defs>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;fill:#24313A}'
        '.title{font-size:23px;font-weight:650}.meta{font-size:12px;fill:#52616A}'
        '.band-label{font-size:13px;font-weight:600}.month{font-size:9px;fill:#52616A}'
        '.season{font-size:11px;font-weight:600}.signature{font-size:12px;font-weight:650}'
        '.signature-sub{font-size:10px;fill:#52616A}</style>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{BG_COLOR}"/>',
        f'<g filter="url(#soft-shadow)">'
        f'<rect x="{LEFT}" y="{EARLY_TOP}" width="{PLOT_WIDTH}" height="{BAND_HEIGHT}" fill="{SHADOW_COLOR}"/>'
        f'<rect x="{LEFT}" y="{LATE_TOP}" width="{PLOT_WIDTH}" height="{BAND_HEIGHT}" fill="{SHADOW_COLOR}"/></g>',
        '<text x="40" y="42" class="title">Les saisons se déplacent</text>',
        '<text x="40" y="66" class="meta">Deux calendriers thermiques locaux comparés.</text>',
        '<text x="40" y="88" class="meta">1996–2025 · référence 1991–2020 · seuils locaux T25 / T75</text>',
    ]

    for index, label in enumerate(MONTHS):
        start = _DOY_START[index]
        end = min(_DOY_START[index + 1], NOLEAP_DAYS)
        x0 = _x(start)
        x1 = _x(end)
        parts.append(
            f'<rect x="{x0:.1f}" y="{MONTHS_TOP}" width="{x1 - x0:.1f}" '
            f'height="{BAND_HEIGHT}" fill="#FBFAF7"/>'
        )
        parts.append(
            f'<text x="{(x0 + x1) / 2:.1f}" y="{MONTHS_TOP + 19}" class="month" '
            f'text-anchor="middle">{label}</text>'
        )
    for doy in [*_DOY_START[:-1], NOLEAP_DAYS]:
        x = _x(doy)
        parts.append(
            f'<line class="ts-month-separator" x1="{x:.1f}" y1="{MONTHS_TOP}" '
            f'x2="{x:.1f}" y2="{MONTHS_TOP + BAND_HEIGHT}" '
            'stroke="#52616A" stroke-width="0.8" stroke-dasharray="1 3" opacity="0.58"/>'
        )

    early_meds = _medians(early)
    late_meds = _medians(late)
    if early_meds and late_meds:
        for boundary, early_med, late_med in zip(
            ("spring", "summer", "autumn", "winter"), early_meds, late_meds, strict=True
        ):
            parts.append(
                f'<line class="ts-median-connector" data-boundary="{boundary}" '
                f'x1="{_x(early_med):.1f}" y1="{EARLY_TOP + BAND_HEIGHT + 4}" '
                f'x2="{_x(late_med):.1f}" y2="{LATE_TOP - 4}" stroke="{MEDIAN_COLOR}" '
                'stroke-width="1" stroke-dasharray="2 3" opacity="0.72"/>'
            )

    for label, decade, y in (("1996–2005", early, EARLY_TOP), ("2016–2025", late, LATE_TOP)):
        parts.append(
            f'<text x="{LEFT - 10}" y="{y + BAND_HEIGHT / 2 + 4}" class="band-label" '
            f'text-anchor="end">{label}</text>'
        )
        meds = _medians(decade)
        if not meds:
            parts.append(
                f'<rect x="{LEFT}" y="{y}" width="{PLOT_WIDTH}" height="{BAND_HEIGHT}" '
                'fill="#EDEDEA" stroke="#C5C4C1"/>'
            )
            continue

        edges = [1.0] + meds + [float(NOLEAP_DAYS)]
        for seg in range(5):
            x0 = _x(edges[seg])
            x1 = _x(edges[seg + 1])
            color = SEASON_COLORS[SEASON_ORDER[seg]]
            parts.append(
                f'<rect x="{x0:.1f}" y="{y}" width="{x1 - x0:.1f}" height="{BAND_HEIGHT}" '
                f'fill="{color}" opacity="{SEASON_OPACITY}"/>'
            )

        boundaries = (
            decade.get("spring_start", {}),
            decade.get("summer_start", {}),
            decade.get("autumn_start", {}),
            decade.get("winter_start", {}),
        )
        for seg, boundary in enumerate(boundaries):
            if not isinstance(boundary, Mapping):
                continue
            med, p25, p75 = boundary.get("median"), boundary.get("p25"), boundary.get("p75")
            if med is None or p25 is None or p75 is None:
                continue
            p25x = _x(float(p25))
            p75x = _x(float(p75))
            parts.append(
                f'<rect x="{p25x:.1f}" y="{y}" width="{p75x - p25x:.1f}" height="{BAND_HEIGHT}" '
                f'fill="{UNCERTAINTY_FILL}" opacity="0.30"/>'
            )
            gradient_id = TRANSITION_GRADIENT[(SEASON_ORDER[seg], SEASON_ORDER[seg + 1])]
            parts.append(
                f'<rect x="{p25x:.1f}" y="{y}" width="{p75x - p25x:.1f}" '
                f'height="{BAND_HEIGHT}" fill="url(#{gradient_id})"/>'
            )
            for edge_x in (p25x, p75x):
                parts.append(
                    f'<line class="ts-uncertainty-boundary" x1="{edge_x:.1f}" y1="{y}" '
                    f'x2="{edge_x:.1f}" y2="{y + BAND_HEIGHT}" stroke="{UNCERTAINTY_STROKE}" '
                    'stroke-width="0.8" stroke-dasharray="1 3" opacity="0.72"/>'
                )
            parts.append(
                f'<line class="ts-season-boundary" x1="{_x(float(med)):.1f}" y1="{y - 4}" '
                f'x2="{_x(float(med)):.1f}" y2="{y + BAND_HEIGHT + 4}" stroke="{MEDIAN_COLOR}" '
                'stroke-width="1.2" stroke-dasharray="1 3" opacity="0.92"/>'
            )

        for seg in range(4):
            center_x = (_x(edges[seg]) + _x(edges[seg + 1])) / 2
            parts.append(
                f'<text x="{center_x:.1f}" y="{y + BAND_HEIGHT / 2 + 4}" class="season" '
                f'text-anchor="middle">{SEASON_LABELS[seg]}</text>'
            )

    comparison = document.get("comparison", {})
    if isinstance(comparison, Mapping):
        summaries = [
            _shift_text(comparison.get("summer_start_shift_days"), subject="Début été"),
            _shift_text(comparison.get("autumn_start_shift_days"), subject="Début automne"),
        ]
        summer_length = comparison.get("summer_length_change_days")
        if isinstance(summer_length, (int, float)):
            sign = "+" if float(summer_length) >= 0 else "−"
            summaries.append(f"Été thermique : {sign}{abs(float(summer_length)):.0f} j")
        y = 162
        for text in (item for item in summaries if item):
            parts.append(f'<text x="{SIG_X}" y="{y}" class="signature">{text}</text>')
            y += 28

    parts.append(
        f'<text x="{SIG_X}" y="{HEIGHT - 18}" class="signature-sub">frontières médianes · zones = P25–P75</text>'
    )
    parts.append("</svg>")
    return "\n".join(parts)


def _thermal_seasons_data(result: Mapping[str, Any]) -> Mapping[str, Any]:
    product = result.get("product")
    method = result.get("method")
    if not isinstance(product, Mapping) or product.get("id") != "thermal-seasons":
        raise ThermalSeasonsRenderError("ClimateResult.product.id doit valoir thermal-seasons")
    if not isinstance(method, Mapping) or method.get("id") != "thermal-seasons" or method.get("version") != "1.0.0":
        raise ThermalSeasonsRenderError("Le renderer exige thermal-seasons@1.0.0")
    data = result.get("data")
    if not isinstance(data, Mapping):
        raise ThermalSeasonsRenderError("ClimateResult.data doit être un objet")
    return data


def render_thermal_seasons_result_svg(result: Mapping[str, Any]) -> str:
    return render_thermal_seasons_svg(_thermal_seasons_data(result))


def write_thermal_seasons_result_svg(result: Mapping[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_thermal_seasons_result_svg(result) + "\n", encoding="utf-8")
    return output_path
