"""Rendu SVG natif P7 de « L'eau au fil de l'année ».

Le renderer transforme uniquement les statistiques déjà présentes dans
``ClimateResult.data`` en coordonnées et primitives SVG. Il ne recalcule aucun
indicateur scientifique.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any, Mapping

METHOD = {"id": "water-through-year", "version": "1.0.0"}
MONTHS = ("JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC")
EARLY, LATE = "1996-2005", "2016-2025"
WIDTH, HEIGHT = 1120, 1180
BAND_X, BAND_WIDTH, BAND_HEIGHT = 40, 1040, 240
PLOT_X, PLOT_WIDTH, MAIN_HEIGHT, DELTA_HEIGHT = 220, 610, 85, 42
CELL = PLOT_WIDTH / 11

BANDS = (
    {
        "id": "precipitation",
        "title": "Précipitations",
        "question": "Quand tombe l’eau au cours de l’année ?",
        "key": "precipitation_mm",
        "unit": "mm/mois",
        "summary": "Pluie annuelle",
        "comparison": "annual_precip_change_pct",
        "comparison_unit": "%",
    },
    {
        "id": "soil",
        "title": "Stock d’eau du sol modélisé",
        "question": "Quand le premier mètre de sol modélisé contient-il le plus d’eau ?",
        "key": "soil_water_0_100_mm",
        "unit": "mm · 0–100 cm",
        "summary": "Stock estival",
        "comparison": "summer_soil_water_change_mm",
        "comparison_unit": "mm",
    },
    {
        "id": "evapotranspiration",
        "title": "Évapotranspiration",
        "question": "Quand repart-elle vers l’atmosphère ?",
        "key": "actual_evapotranspiration_mm",
        "unit": "mm/mois",
        "summary": None,
        "comparison": None,
        "comparison_unit": "",
    },
    {
        "id": "spei3",
        "title": "Indice SPEI-3",
        "question": "Quand le contexte climatique est-il relativement plus sec ou plus humide ?",
        "key": "spei3",
        "unit": "indice sans unité",
        "summary": "Mois secs SPEI-3",
        "comparison": "dry_months_change",
        "comparison_unit": "/ an",
        "threshold": -1.0,
    },
)


def _fmt(value: float | None, digits: int = 1) -> str:
    return "—" if value is None else f"{float(value):.{digits}f}".replace(".", ",")


def _records(document: dict, period: str) -> list[dict]:
    return list(document["monthly"].get(period, {}).values())


def _scale(document: dict, key: str, threshold: float | None) -> tuple[float, float]:
    values = [
        float(record[field])
        for period in (EARLY, LATE)
        for record in _records(document, period)
        for field in (f"{key}_p25", f"{key}_p75")
        if record.get(field) is not None
    ]
    if threshold is not None:
        values.append(threshold)
    if not values:
        return 0.0, 1.0
    low, high = min(values), max(values)
    padding = max((high - low) * 0.12, 0.2 if key == "spei3" else 1.0)
    return low - padding, high + padding


def _position(value: float, low: float, high: float, top: float, height: float) -> float:
    ratio = 0.5 if high == low else (value - low) / (high - low)
    return top + height * (1 - max(0.0, min(1.0, ratio)))


def _path(points: list[tuple[float, float]]) -> str:
    return " ".join(f"{'M' if index == 0 else 'L'} {x:.1f} {y:.1f}" for index, (x, y) in enumerate(points))


def _median_points(records: list[dict], key: str, low: float, high: float, top: float) -> list[tuple[float, float]]:
    return [
        (PLOT_X + index * CELL, _position(float(record[f"{key}_median"]), low, high, top, MAIN_HEIGHT))
        for index, record in enumerate(records)
        if record.get(f"{key}_median") is not None
    ]


def _interval(records: list[dict], key: str, low: float, high: float, top: float) -> str:
    upper = [
        (PLOT_X + index * CELL, _position(float(record[f"{key}_p75"]), low, high, top, MAIN_HEIGHT))
        for index, record in enumerate(records)
        if record.get(f"{key}_p25") is not None and record.get(f"{key}_p75") is not None
    ]
    lower = [
        (PLOT_X + index * CELL, _position(float(record[f"{key}_p25"]), low, high, top, MAIN_HEIGHT))
        for index, record in enumerate(records)
        if record.get(f"{key}_p25") is not None and record.get(f"{key}_p75") is not None
    ]
    return "" if len(upper) < 2 else f"{_path(upper)} {' '.join(f'L {x:.1f} {y:.1f}' for x, y in reversed(lower))} Z"


def _tooltip(month: str, title: str, early: dict, late: dict, key: str, unit: str) -> str:
    digits = 2 if key == "spei3" else 0
    return escape(
        f"{month.title()} · {title}\n\n"
        f"1996–2005 : {_fmt(early.get(f'{key}_median'), digits)} {unit}\n"
        f"2016–2025 : {_fmt(late.get(f'{key}_median'), digits)} {unit}\n"
        f"Écart : {_fmt(_delta(early, late, key), digits)} {unit}"
    )


def _delta(early: dict, late: dict, key: str) -> float | None:
    before, after = early.get(f"{key}_median"), late.get(f"{key}_median")
    return None if before is None or after is None else float(after) - float(before)


def _legend(band: Mapping[str, Any], x: float, top: float) -> str:
    parts = [
        '<g class="local-legend">',
        f'<line x1="{x}" y1="{top}" x2="{x + 23}" y2="{top}" class="legend-median"/>',
        f'<text x="{x + 30}" y="{top + 4}" class="legend-text">1996–2005 · médiane mensuelle</text>',
        f'<line x1="{x}" y1="{top + 14}" x2="{x + 23}" y2="{top + 14}" class="legend-late"/>',
        f'<text x="{x + 30}" y="{top + 18}" class="legend-text">2016–2025 · médiane mensuelle</text>',
        f'<rect x="{x}" y="{top + 27}" width="23" height="8" class="legend-interval"/>',
        f'<text x="{x + 30}" y="{top + 35}" class="legend-text">Intervalle P25–P75</text>',
        f'<rect x="{x}" y="{top + 41}" width="23" height="8" class="legend-delta"/>',
        f'<text x="{x + 30}" y="{top + 49}" class="legend-text">Écart entre les deux décennies</text>',
    ]
    if band.get("threshold") is not None:
        parts.extend([
            f'<line x1="{x}" y1="{top + 62}" x2="{x + 23}" y2="{top + 62}" class="legend-threshold"/>',
            f'<text x="{x + 30}" y="{top + 66}" class="legend-text">Seuil sec</text>',
        ])
    parts.append('</g>')
    return "".join(parts)


def _summary(band: Mapping[str, Any], comparison: Mapping[str, Any], x: float, top: float) -> str:
    key = band.get("comparison")
    if key is None or comparison.get(key) is None:
        return ""
    value = float(comparison[key])
    if band["id"] == "precipitation":
        display = f"{_fmt(abs(value))} % de {'moins' if value < 0 else 'plus'}"
    elif band["id"] == "soil":
        display = f"{_fmt(abs(value))} mm de {'moins' if value < 0 else 'plus'}"
    else:
        quantity = "mois" if abs(value) != 1 else "mois"
        display = f"{_fmt(abs(value), 0)} {quantity} de {'moins' if value < 0 else 'plus'} par an"
    return (
        f'<text x="{x}" y="{top}" class="summary-label">{escape(str(band["summary"]))}</text>'
        f'<text x="{x}" y="{top + 21}" class="summary-value">{escape(display)}</text>'
        f'<text x="{x}" y="{top + 36}" class="summary-context">2016–2025 vs 1996–2005</text>'
    )


def _delta_strip(early: list[dict], late: list[dict], key: str, unit: str, top: float) -> str:
    deltas = [_delta(before, after, key) for before, after in zip(early, late, strict=True)]
    magnitude = max((abs(value) for value in deltas if value is not None), default=1.0)
    magnitude = max(magnitude * 1.1, 0.1 if key == "spei3" else 1.0)
    zero = top + DELTA_HEIGHT / 2
    parts = [
        '<g class="delta-strip">',
        f'<text x="{PLOT_X - 10}" y="{top + 10}" class="delta-title" text-anchor="end">Écart 2016–2025 − 1996–2005 · {escape(unit)}</text>',
        f'<line x1="{PLOT_X}" y1="{zero:.1f}" x2="{PLOT_X + PLOT_WIDTH}" y2="{zero:.1f}" class="delta-zero"/>',
        f'<text x="{PLOT_X + PLOT_WIDTH + 10}" y="{zero - 5:.1f}" class="delta-direction">plus élevé</text>',
        f'<text x="{PLOT_X + PLOT_WIDTH + 10}" y="{zero + 11:.1f}" class="delta-direction">plus faible</text>',
    ]
    for index, value in enumerate(deltas):
        if value is None:
            continue
        height = abs(value) / magnitude * (DELTA_HEIGHT / 2 - 2)
        y = zero - height if value >= 0 else zero
        color = "#B2182B" if value > 0 else "#2166AC" if value < 0 else "#9DA5A4"
        parts.append(f'<rect class="delta-value" x="{PLOT_X + index * CELL - 6:.1f}" y="{y:.1f}" width="12" height="{height:.1f}" fill="{color}"/>')
    parts.append('</g>')
    return "".join(parts)


def _band(document: dict, band: Mapping[str, Any], top: float) -> str:
    key, title, unit = str(band["key"]), str(band["title"]), str(band["unit"])
    early, late = _records(document, EARLY), _records(document, LATE)
    main_top, delta_top = top + 65, top + 181
    low, high = _scale(document, key, band.get("threshold"))
    early_points = _median_points(early, key, low, high, main_top)
    late_points = _median_points(late, key, low, high, main_top)
    parts = [
        f'<g class="data-band" data-band="{escape(str(band["id"]))}">',
        f'<rect class="band-background" x="{BAND_X}" y="{top}" width="{BAND_WIDTH}" height="{BAND_HEIGHT}"/>',
        f'<text x="64" y="{top + 31}" class="band-title">{escape(title)}</text>',
        f'<text x="64" y="{top + 49}" class="band-question">{escape(str(band["question"]))}</text>',
        _summary(band, document.get("comparison", {}), 865, top + 31),
        _legend(band, 865, top + 82),
    ]
    for index, month in enumerate(MONTHS):
        x = PLOT_X + index * CELL
        parts.append(f'<line x1="{x:.1f}" y1="{main_top}" x2="{x:.1f}" y2="{delta_top + DELTA_HEIGHT}" class="month-guide"/>')
        parts.append(f'<text x="{x:.1f}" y="{top + 169}" class="month" text-anchor="middle">{month}</text>')
    parts.append(f'<line x1="{PLOT_X + PLOT_WIDTH:.1f}" y1="{main_top}" x2="{PLOT_X + PLOT_WIDTH:.1f}" y2="{delta_top + DELTA_HEIGHT}" class="month-guide"/>')
    if band.get("threshold") is not None:
        y = _position(float(band["threshold"]), low, high, main_top, MAIN_HEIGHT)
        parts.append(f'<line x1="{PLOT_X}" y1="{y:.1f}" x2="{PLOT_X + PLOT_WIDTH}" y2="{y:.1f}" class="dry-threshold"/>')
        parts.append(f'<text x="{PLOT_X + 4}" y="{y - 4:.1f}" class="threshold-note">seuil des mois secs retenu : SPEI-3 &lt; −1</text>')
        zero = _position(0, low, high, main_top, MAIN_HEIGHT)
        parts.append(f'<line x1="{PLOT_X}" y1="{zero:.1f}" x2="{PLOT_X + PLOT_WIDTH}" y2="{zero:.1f}" class="spei-zero"/>')
        parts.append(f'<text x="{PLOT_X - 8}" y="{zero - 4:.1f}" class="spei-axis" text-anchor="end">plus humide</text>')
        parts.append(f'<text x="{PLOT_X - 8}" y="{zero + 4:.1f}" class="spei-axis" text-anchor="end">0</text>')
        parts.append(f'<text x="{PLOT_X - 8}" y="{zero + 13:.1f}" class="spei-axis" text-anchor="end">plus sec</text>')
    for records, color, opacity in ((early, "#2166AC", ".14"), (late, "#B2182B", ".10")):
        interval = _interval(records, key, low, high, main_top)
        if interval:
            parts.append(f'<path d="{interval}" fill="{color}" opacity="{opacity}"/>')
    if early_points:
        parts.append(f'<path d="{_path(early_points)}" class="profile-early"/>')
    if late_points:
        parts.append(f'<path d="{_path(late_points)}" class="profile-late"/>')
    parts.append(_delta_strip(early, late, key, unit, delta_top))
    for index, (before, after) in enumerate(zip(early, late, strict=True)):
        parts.append(f'<rect x="{PLOT_X + index * CELL - CELL / 2:.1f}" y="{main_top}" width="{CELL:.1f}" height="{MAIN_HEIGHT + DELTA_HEIGHT}" fill="transparent"><title>{_tooltip(MONTHS[index], title, before, after, key, unit)}</title></rect>')
    parts.append('</g>')
    return "".join(parts)


def render_water_through_year_svg(document: dict) -> str:
    """Affiche les statistiques mensuelles sérialisées et leurs écarts visuels."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="water-title water-desc">',
        '<title id="water-title">L’eau au fil de l’année</title>',
        '<desc id="water-desc">Quatre cycles mensuels et quatre mini-bandes d’écart entre 2016–2025 et 1996–2005.</desc>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;fill:#24313A}.title{font-size:24px;font-weight:650}.meta{font-size:12px;fill:#52616A}.period-note{font-size:10px;fill:#52616A}.band-title{font-size:16px;font-weight:650}.band-question,.month,.legend-text,.delta-title,.delta-direction,.summary-context,.threshold-note,.spei-axis{font-size:9px;fill:#52616A}.summary-label{font-size:10px;fill:#52616A}.summary-value{font-size:16px;font-weight:650}.band-background{fill:#FBFAF7}.month-guide{stroke:#9DA5A4;stroke-width:.45;stroke-dasharray:1 3;opacity:.55}.profile-early,.legend-median{fill:none;stroke:#2166AC;stroke-width:2}.profile-late,.legend-late{fill:none;stroke:#B2182B;stroke-width:2;stroke-dasharray:5 3}.legend-interval{fill:#2166AC;opacity:.08}.legend-delta{fill:#B2182B;opacity:.6}.dry-threshold,.legend-threshold{stroke:#9A6238;stroke-width:1.2;stroke-dasharray:3 2}.spei-zero{stroke:#52616A;stroke-width:.8}.delta-zero{stroke:#24313A;stroke-width:1}</style>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#C5C4C1"/>',
        '<text x="40" y="42" class="title">L’eau au fil de l’année</text>',
        '<text x="40" y="65" class="meta">Le cycle saisonnier domine ; les écarts entre décennies sont localisés.</text>',
        '<text x="40" y="86" class="meta">Comparaison 1996–2005 / 2016–2025 · ERA5-Land + ERA5-Drought</text>',
    ]
    for index, band in enumerate(BANDS):
        parts.append(_band(document, band, 125 + index * 260))
    parts.append('</svg>')
    return "\n".join(parts)


def extract_water_data(result_or_data: Mapping[str, Any]) -> dict:
    if "data" not in result_or_data:
        return dict(result_or_data)
    if result_or_data.get("method") != METHOD:
        raise ValueError(f"ClimateResult attendu pour {METHOD['id']}@{METHOD['version']}")
    data = result_or_data.get("data")
    if not isinstance(data, Mapping):
        raise ValueError("ClimateResult.data est absent ou invalide")
    return dict(data)


def render_water_result_svg(result_or_data: Mapping[str, Any]) -> str:
    return render_water_through_year_svg(extract_water_data(result_or_data))


def write_water_result_svg(result_or_data: Mapping[str, Any], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_water_result_svg(result_or_data), encoding="utf-8")
    return output
