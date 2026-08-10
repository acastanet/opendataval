"""Rendu SVG natif P7 de « L'eau au fil de l'année ».

Le renderer ne fait que mettre en forme ``ClimateResult.data`` : aucun seuil,
aucune série et aucune agrégation scientifique n'y sont recalculés.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any, Mapping

METHOD = {"id": "water-through-year", "version": "1.0.0"}
MONTHS = ("JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC")
WIDTH, HEIGHT = 1120, 1000
BAND_X, BAND_WIDTH, BAND_HEIGHT = 40, 1040, 190
PLOT_X, PLOT_WIDTH, PLOT_HEIGHT = 220, 610, 96
CELL = PLOT_WIDTH / 11
EARLY, LATE = "1996-2005", "2016-2025"
EARLY_COLOR, LATE_COLOR = "#2166AC", "#B2182B"

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
        "summary": "Stock estival",
        "comparison": "summer_soil_water_change_mm",
        "comparison_unit": "mm",
    },
    {
        "id": "evapotranspiration",
        "title": "Évapotranspiration",
        "key": "actual_evapotranspiration_mm",
        "unit": "mm/mois",
        "summary": "Profil mensuel",
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
        "comparison_unit": "mois/an",
        "threshold": -1.0,
    },
)


def _fmt(value: float | None, digits: int = 0) -> str:
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


def _points(records: list[dict], key: str, minimum: float, maximum: float, top: float) -> list[tuple[float, float]]:
    return [
        (PLOT_X + index * CELL, _y(float(record[f"{key}_median"]), minimum, maximum, top))
        for index, record in enumerate(records)
        if record.get(f"{key}_median") is not None
    ]


def _path(points: list[tuple[float, float]]) -> str:
    return " ".join(
        f"{'M' if index == 0 else 'L'} {x:.1f} {y:.1f}"
        for index, (x, y) in enumerate(points)
    )


def _interval(records: list[dict], key: str, minimum: float, maximum: float, top: float) -> str:
    upper = [
        (PLOT_X + index * CELL, _y(float(record[f"{key}_p75"]), minimum, maximum, top))
        for index, record in enumerate(records)
        if record.get(f"{key}_p75") is not None and record.get(f"{key}_p25") is not None
    ]
    lower = [
        (PLOT_X + index * CELL, _y(float(record[f"{key}_p25"]), minimum, maximum, top))
        for index, record in enumerate(records)
        if record.get(f"{key}_p75") is not None and record.get(f"{key}_p25") is not None
    ]
    return "" if len(upper) < 2 else f"{_path(upper)} {' '.join(f'L {x:.1f} {y:.1f}' for x, y in reversed(lower))} Z"


def _tooltip(month: str, title: str, early: dict, late: dict, key: str, unit: str) -> str:
    return escape(
        f"{month.title()} · {title}\n\n"
        f"1996–2005 : {_fmt(early.get(f'{key}_median'), 2 if key == 'spei3' else 0)} {unit}\n"
        f"2016–2025 : {_fmt(late.get(f'{key}_median'), 2 if key == 'spei3' else 0)} {unit}\n"
        "Les zones colorées représentent P25–P75."
    )


def _comparison(band: Mapping[str, Any], comparison: Mapping[str, Any]) -> str:
    key = band.get("comparison")
    if not key:
        return '<text x="860" y="86" class="comparison-note">Lecture mensuelle</text>'
    value = comparison.get(key)
    if value is None:
        display = "donnée insuffisante"
    else:
        numeric = float(value)
        sign = "+" if numeric > 0 else "−" if numeric < 0 else ""
        digits = 0 if abs(numeric) >= 10 else 1
        display = f"{sign}{_fmt(abs(numeric), digits)} {band['comparison_unit']}"
    return (
        f'<text x="860" y="68" class="comparison-label">{escape(str(band["summary"]))}</text>'
        f'<text x="860" y="89" class="comparison-value">{escape(display)}</text>'
    )


def _legend(band: Mapping[str, Any]) -> str:
    parts = [
        '<g class="local-legend">',
        '<line x1="860" y1="116" x2="883" y2="116" class="legend-early"/>',
        '<text x="890" y="120" class="legend-text">Médiane mensuelle</text>',
        '<rect x="860" y="130" width="23" height="9" class="legend-interval"/>',
        '<text x="890" y="139" class="legend-text">Intervalle P25–P75</text>',
    ]
    if band.get("threshold") is not None:
        parts.extend([
            '<line x1="860" y1="153" x2="883" y2="153" class="legend-threshold"/>',
            '<text x="890" y="157" class="legend-text">Seuil sec</text>',
        ])
    parts.append('</g>')
    return "".join(parts)


def _band(document: dict, band: Mapping[str, Any], top: float) -> str:
    key, title, unit = str(band["key"]), str(band["title"]), str(band["unit"])
    early, late = _records(document, EARLY), _records(document, LATE)
    plot_top = top + 54
    minimum, maximum = _scale(document, key, band.get("threshold"))
    early_points = _points(early, key, minimum, maximum, plot_top)
    late_points = _points(late, key, minimum, maximum, plot_top)
    parts = [
        f'<g class="band" data-band="{escape(str(band["id"]))}">',
        f'<rect class="band-background" x="{BAND_X}" y="{top}" width="{BAND_WIDTH}" height="{BAND_HEIGHT}"/>',
        f'<text x="64" y="{top + 35}" class="band-title">{escape(title)}</text>',
        f'<text x="64" y="{top + 55}" class="band-unit">{escape(unit)}</text>',
        _comparison(band, document.get("comparison", {})),
        _legend(band),
    ]
    for index, month in enumerate(MONTHS):
        x = PLOT_X + index * CELL
        parts.append(f'<line x1="{x:.1f}" y1="{plot_top}" x2="{x:.1f}" y2="{plot_top + PLOT_HEIGHT}" class="month-guide"/>')
        parts.append(f'<text x="{x:.1f}" y="{top + 174}" class="month" text-anchor="middle">{month}</text>')
    parts.append(f'<line x1="{PLOT_X + PLOT_WIDTH:.1f}" y1="{plot_top}" x2="{PLOT_X + PLOT_WIDTH:.1f}" y2="{plot_top + PLOT_HEIGHT}" class="month-guide"/>')
    threshold = band.get("threshold")
    if threshold is not None:
        y = _y(float(threshold), minimum, maximum, plot_top)
        parts.append(f'<line x1="{PLOT_X}" y1="{y:.1f}" x2="{PLOT_X + PLOT_WIDTH}" y2="{y:.1f}" class="dry-threshold"/>')
    for records, color, opacity in ((early, EARLY_COLOR, ".16"), (late, LATE_COLOR, ".12")):
        interval = _interval(records, key, minimum, maximum, plot_top)
        if interval:
            parts.append(f'<path d="{interval}" fill="{color}" opacity="{opacity}"/>')
    if early_points:
        parts.append(f'<path d="{_path(early_points)}" class="profile-early"/>')
    if late_points:
        parts.append(f'<path d="{_path(late_points)}" class="profile-late"/>')
    for index, (early_record, late_record) in enumerate(zip(early, late, strict=True)):
        tip = _tooltip(MONTHS[index], title, early_record, late_record, key, unit)
        parts.append(f'<rect x="{PLOT_X + index * CELL - CELL / 2:.1f}" y="{plot_top}" width="{CELL:.1f}" height="{PLOT_HEIGHT}" fill="transparent"><title>{tip}</title></rect>')
    if early_points:
        parts.append(f'<text x="{early_points[-1][0] + 8:.1f}" y="{early_points[-1][1] - 5:.1f}" class="period-label">1996–2005</text>')
    if late_points:
        parts.append(f'<text x="{late_points[-1][0] + 8:.1f}" y="{late_points[-1][1] + 11:.1f}" class="period-label">2016–2025</text>')
    parts.append('</g>')
    return "".join(parts)


def render_water_through_year_svg(document: dict) -> str:
    """Affiche les statistiques mensuelles déjà sérialisées dans le document JSON."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="water-title water-desc">',
        '<title id="water-title">L’eau au fil de l’année</title>',
        '<desc id="water-desc">Quatre bandes mensuelles : précipitations, stock d’eau du sol modélisé, évapotranspiration et indice SPEI-3.</desc>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;fill:#24313A}.title{font-size:24px;font-weight:650}.meta{font-size:12px;fill:#52616A}.band-title{font-size:16px;font-weight:650}.band-unit,.month,.legend-text,.comparison-label,.comparison-note,.period-label{font-size:10px;fill:#52616A}.comparison-value{font-size:16px;font-weight:650}.band-background{fill:#FBFAF7}.month-guide{stroke:#9DA5A4;stroke-width:.45;stroke-dasharray:1 3;opacity:.55}.profile-early,.legend-early{fill:none;stroke:#2166AC;stroke-width:2}.profile-late{fill:none;stroke:#B2182B;stroke-width:2;stroke-dasharray:5 3}.legend-interval{fill:#2166AC;opacity:.16}.dry-threshold,.legend-threshold{stroke:#9A6238;stroke-width:1.2;stroke-dasharray:3 2}</style>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#C5C4C1"/>',
        '<text x="40" y="42" class="title">L’eau au fil de l’année</text>',
        '<text x="40" y="65" class="meta">Quatre lectures mensuelles du cycle de l’eau.</text>',
        '<text x="40" y="86" class="meta">1996–2025 · ERA5-Land + ERA5-Drought</text>',
    ]
    for index, band in enumerate(BANDS):
        parts.append(_band(document, band, 110 + index * 210))
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
