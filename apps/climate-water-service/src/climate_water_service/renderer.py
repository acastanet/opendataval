"""Rendu SVG natif P7 de « L'eau au fil de l'année ».

Ce module ne fait que présenter ``ClimateResult.data``. Il ne recalcule ni
séries, ni seuils, ni agrégations scientifiques.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any, Mapping

METHOD = {"id": "water-through-year", "version": "1.0.0"}
MONTHS = ("JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC")
EARLY, LATE = "1996-2005", "2016-2025"
WIDTH, HEIGHT = 1240, 1030
LEFT_X, RIGHT_X, COLUMN_WIDTH = 40, 660, 540
BAND_HEIGHT, PLOT_X_OFFSET, PLOT_WIDTH, PLOT_HEIGHT = 185, 20, 320, 92
CELL = PLOT_WIDTH / 11

BANDS = (
    {
        "id": "precipitation",
        "title": "Précipitations",
        "key": "precipitation_mm",
        "unit": "mm/mois",
        "summary": "Pluie annuelle",
        "comparison": "annual_precip_change_pct",
        "comparison_unit": "%",
    },
    {
        "id": "soil",
        "title": "Stock d’eau du sol modélisé",
        "key": "soil_water_0_100_mm",
        "unit": "mm · 0–100 cm",
        "summary": "Été",
        "comparison": "summer_soil_water_change_mm",
        "comparison_unit": "mm",
    },
    {
        "id": "evapotranspiration",
        "title": "Évapotranspiration",
        "key": "actual_evapotranspiration_mm",
        "unit": "mm/mois",
        "summary": "Évapotranspiration",
        "comparison": None,
        "comparison_unit": "",
    },
    {
        "id": "spei3",
        "title": "Indice SPEI-3",
        "key": "spei3",
        "unit": "indice sans unité",
        "summary": "Mois secs",
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
    minimum, maximum = min(values), max(values)
    padding = max((maximum - minimum) * 0.12, 0.2 if key == "spei3" else 1.0)
    return minimum - padding, maximum + padding


def _y(value: float, minimum: float, maximum: float, top: float) -> float:
    ratio = 0.5 if maximum == minimum else (value - minimum) / (maximum - minimum)
    return top + PLOT_HEIGHT * (1 - max(0.0, min(1.0, ratio)))


def _path(points: list[tuple[float, float]]) -> str:
    return " ".join(f"{'M' if index == 0 else 'L'} {x:.1f} {y:.1f}" for index, (x, y) in enumerate(points))


def _median_points(records: list[dict], key: str, minimum: float, maximum: float, x: float, top: float) -> list[tuple[float, float]]:
    return [
        (x + index * CELL, _y(float(record[f"{key}_median"]), minimum, maximum, top))
        for index, record in enumerate(records)
        if record.get(f"{key}_median") is not None
    ]


def _interval(records: list[dict], key: str, minimum: float, maximum: float, x: float, top: float) -> str:
    upper = [
        (x + index * CELL, _y(float(record[f"{key}_p75"]), minimum, maximum, top))
        for index, record in enumerate(records)
        if record.get(f"{key}_p25") is not None and record.get(f"{key}_p75") is not None
    ]
    lower = [
        (x + index * CELL, _y(float(record[f"{key}_p25"]), minimum, maximum, top))
        for index, record in enumerate(records)
        if record.get(f"{key}_p25") is not None and record.get(f"{key}_p75") is not None
    ]
    return "" if len(upper) < 2 else f"{_path(upper)} {' '.join(f'L {px:.1f} {py:.1f}' for px, py in reversed(lower))} Z"


def _tooltip(month: str, title: str, record: dict, key: str, unit: str) -> str:
    return escape(
        f"{month.title()} · {title}\n\n"
        f"Médiane : {_fmt(record.get(f'{key}_median'), 2 if key == 'spei3' else 0)} {unit}\n"
        f"P25–P75 : {_fmt(record.get(f'{key}_p25'), 2 if key == 'spei3' else 0)}–{_fmt(record.get(f'{key}_p75'), 2 if key == 'spei3' else 0)} {unit}"
    )


def _legend(band: Mapping[str, Any], x: float, top: float) -> str:
    parts = [
        '<g class="local-legend">',
        f'<line x1="{x:.1f}" y1="{top:.1f}" x2="{x + 23:.1f}" y2="{top:.1f}" class="legend-median"/>',
        f'<text x="{x + 30:.1f}" y="{top + 4:.1f}" class="legend-text">Médiane mensuelle</text>',
        f'<rect x="{x:.1f}" y="{top + 14:.1f}" width="23" height="9" class="legend-interval"/>',
        f'<text x="{x + 30:.1f}" y="{top + 23:.1f}" class="legend-text">Intervalle P25–P75</text>',
    ]
    if band.get("threshold") is not None:
        parts.extend([
            f'<line x1="{x:.1f}" y1="{top + 37:.1f}" x2="{x + 23:.1f}" y2="{top + 37:.1f}" class="legend-threshold"/>',
            f'<text x="{x + 30:.1f}" y="{top + 41:.1f}" class="legend-text">Seuil sec</text>',
        ])
    parts.append('</g>')
    return "".join(parts)


def _band(document: dict, band: Mapping[str, Any], period: str, x: float, top: float) -> str:
    key, title, unit = str(band["key"]), str(band["title"]), str(band["unit"])
    records = _records(document, period)
    plot_x, plot_top = x + PLOT_X_OFFSET, top + 57
    minimum, maximum = _scale(document, key, band.get("threshold"))
    points = _median_points(records, key, minimum, maximum, plot_x, plot_top)
    parts = [
        f'<g class="data-band" data-band="{escape(str(band["id"]))}" data-period="{period}">',
        f'<rect class="band-background" x="{x}" y="{top}" width="{COLUMN_WIDTH}" height="{BAND_HEIGHT}"/>',
        f'<text x="{x + 20}" y="{top + 32}" class="band-title">{escape(title)}</text>',
        f'<text x="{x + 20}" y="{top + 50}" class="band-unit">{escape(unit)}</text>',
        _legend(band, x + 365, top + 69),
    ]
    for index, month in enumerate(MONTHS):
        month_x = plot_x + index * CELL
        parts.append(f'<line x1="{month_x:.1f}" y1="{plot_top}" x2="{month_x:.1f}" y2="{plot_top + PLOT_HEIGHT}" class="month-guide"/>')
        parts.append(f'<text x="{month_x:.1f}" y="{top + 169}" class="month" text-anchor="middle">{month}</text>')
    parts.append(f'<line x1="{plot_x + PLOT_WIDTH:.1f}" y1="{plot_top}" x2="{plot_x + PLOT_WIDTH:.1f}" y2="{plot_top + PLOT_HEIGHT}" class="month-guide"/>')
    if band.get("threshold") is not None:
        y = _y(float(band["threshold"]), minimum, maximum, plot_top)
        parts.append(f'<line x1="{plot_x}" y1="{y:.1f}" x2="{plot_x + PLOT_WIDTH}" y2="{y:.1f}" class="dry-threshold"/>')
    interval = _interval(records, key, minimum, maximum, plot_x, plot_top)
    if interval:
        parts.append(f'<path d="{interval}" class="profile-interval"/>')
    if points:
        parts.append(f'<path d="{_path(points)}" class="profile-median"/>')
    for index, record in enumerate(records):
        tip = _tooltip(MONTHS[index], title, record, key, unit)
        parts.append(f'<rect x="{plot_x + index * CELL - CELL / 2:.1f}" y="{plot_top}" width="{CELL:.1f}" height="{PLOT_HEIGHT}" fill="transparent"><title>{tip}</title></rect>')
    parts.append('</g>')
    return "".join(parts)


def _summary(band: Mapping[str, Any], comparison: Mapping[str, Any], y: float) -> str:
    key = band.get("comparison")
    if key is None:
        text = "Évapotranspiration : lecture mensuelle"
    elif comparison.get(key) is None:
        text = f"{band['summary']} : donnée insuffisante"
    else:
        value = float(comparison[key])
        sign = "+" if value > 0 else "−" if value < 0 else ""
        text = f"{band['summary']} : {sign}{_fmt(abs(value))} {band['comparison_unit']}"
    return f'<text x="{WIDTH / 2:.1f}" y="{y:.1f}" class="row-summary" text-anchor="middle">{escape(text)}</text>'


def render_water_through_year_svg(document: dict) -> str:
    """Affiche les statistiques mensuelles déjà sérialisées dans le document JSON."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="water-title water-desc">',
        '<title id="water-title">L’eau au fil de l’année</title>',
        '<desc id="water-desc">Huit bandes mensuelles réparties en deux colonnes temporelles pour les précipitations, le stock d’eau du sol modélisé, l’évapotranspiration et le SPEI-3.</desc>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;fill:#24313A}.title{font-size:24px;font-weight:650}.meta{font-size:12px;fill:#52616A}.column-title{font-size:17px;font-weight:650}.band-title{font-size:15px;font-weight:650}.band-unit,.month,.legend-text{font-size:9px;fill:#52616A}.row-summary{font-size:12px;font-weight:650;fill:#52616A}.band-background{fill:#FBFAF7}.month-guide{stroke:#9DA5A4;stroke-width:.45;stroke-dasharray:1 3;opacity:.55}.profile-median,.legend-median{fill:none;stroke:#2166AC;stroke-width:2}.profile-interval{fill:#2166AC;opacity:.16}.legend-interval{fill:#2166AC;opacity:.16}.dry-threshold,.legend-threshold{stroke:#9A6238;stroke-width:1.2;stroke-dasharray:3 2}</style>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#C5C4C1"/>',
        '<text x="40" y="42" class="title">L’eau au fil de l’année</text>',
        '<text x="40" y="65" class="meta">Chaque carte présente une donnée pour une période donnée.</text>',
        '<text x="40" y="86" class="meta">ERA5-Land + ERA5-Drought</text>',
        f'<text x="{LEFT_X + COLUMN_WIDTH / 2:.1f}" y="120" class="column-title" text-anchor="middle">1996–2005</text>',
        f'<text x="{RIGHT_X + COLUMN_WIDTH / 2:.1f}" y="120" class="column-title" text-anchor="middle">2016–2025</text>',
    ]
    for index, band in enumerate(BANDS):
        top = 140 + index * 220
        parts.append(_band(document, band, EARLY, LEFT_X, top))
        parts.append(_band(document, band, LATE, RIGHT_X, top))
        parts.append(_summary(band, document.get("comparison", {}), top + 205))
    parts.append('</svg>')
    return "\n".join(parts)


def extract_water_data(result_or_data: Mapping[str, Any]) -> dict:
    if "data" not in result_or_data:
        return dict(result_or_data)
    method = result_or_data.get("method")
    if method != METHOD:
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
