from __future__ import annotations

from dataclasses import dataclass
from html import escape
from math import copysign
from pathlib import Path
from typing import Any, Mapping

PERIOD_START = 1996
PERIOD_END = 2025

COMMON_PALETTE: tuple[tuple[float, str], ...] = (
    (0.00, "#2166AC"),
    (0.25, "#92C5DE"),
    (0.38, "#D1E5F0"),
    (0.44, "#F3F5F4"),
    (0.50, "#FBFAF7"),
    (0.56, "#F7F3EF"),
    (0.62, "#FDDBC7"),
    (0.75, "#F4A582"),
    (1.00, "#B2182B"),
)

ROBUST_SIGMA_FACTOR = 2.563
EXCEPTIONAL_Z = 3.0
EMPHASIS_GAMMA = 2.0
EXCEPTIONAL_OFFSET = 0.10
BALANCE_FULL_SCALE = 0.3
BALANCE_OFFSET = 10
BAND_PLATE = "#FBFAF7"


@dataclass(frozen=True)
class RenderTheme:
    identifier: str
    background: str
    band_relief: bool


THEMES: dict[str, RenderTheme] = {
    "light": RenderTheme("light", "#FAFAF7", False),
    "neutral": RenderTheme("neutral", "#C5C4C1", True),
}


class FingerprintRenderError(ValueError):
    pass


def _hex_rgb(color: str) -> tuple[int, int, int]:
    value = color.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def _interpolate_color(stops: tuple[tuple[float, str], ...], position: float) -> str:
    position = min(1.0, max(0.0, position))
    for (left_position, left_color), (right_position, right_color) in zip(stops, stops[1:], strict=False):
        if position <= right_position:
            ratio = 0.0 if right_position == left_position else (position - left_position) / (right_position - left_position)
            left_rgb, right_rgb = _hex_rgb(left_color), _hex_rgb(right_color)
            rgb = tuple(round(a + (b - a) * ratio) for a, b in zip(left_rgb, right_rgb, strict=True))
            return "#" + "".join(f"{channel:02X}" for channel in rgb)
    return stops[-1][1]


def _robust_position(cell: Mapping[str, Any], reference: object) -> float | None:
    value = cell.get("value")
    if not isinstance(value, (int, float)) or not isinstance(reference, Mapping):
        return None
    p10, p50, p90 = reference.get("p10"), reference.get("p50"), reference.get("p90")
    if not all(isinstance(threshold, (int, float)) for threshold in (p10, p50, p90)):
        return None
    spread = (float(p90) - float(p10)) / ROBUST_SIGMA_FACTOR
    if spread <= 0:
        return None
    z = (float(value) - float(p50)) / spread
    return min(1.0, max(0.0, 0.5 + z / (2 * EXCEPTIONAL_Z)))


def _cell_position(cell: Mapping[str, Any], reference: object = None) -> float:
    robust = _robust_position(cell, reference)
    if robust is not None:
        return robust
    class_index = cell.get("class_index")
    fallback = (
        (0.00, 0.25, 0.50, 0.75, 1.00)[class_index]
        if isinstance(class_index, int) and 0 <= class_index <= 4
        else 0.50
    )
    percentile = cell.get("percentile")
    if isinstance(percentile, (int, float)):
        position = float(percentile) / 100
        if isinstance(class_index, int) and abs(position - fallback) > 0.55:
            position = fallback
    else:
        position = fallback
    return min(1.0, max(0.0, position))


def _emphasise(position: float) -> float:
    offset = position - 0.5
    return 0.5 + copysign(abs(offset / 0.5) ** EMPHASIS_GAMMA, offset) / 2


def _emphasised_position(cell: Mapping[str, Any], reference: object = None) -> float:
    return _emphasise(_cell_position(cell, reference))


def _cell_color(cell: Mapping[str, Any], reference: object = None) -> str:
    return _interpolate_color(COMMON_PALETTE, _emphasised_position(cell, reference))


def _cell_tooltip(row: Mapping[str, Any], cell: Mapping[str, Any]) -> str:
    label = str(row.get("label", "Indicateur"))
    year = cell.get("year")
    unit = str(row.get("unit", ""))
    if cell.get("applicable") is False:
        return f"{year} — {label}\nIndicateur non pertinent pour ce lieu"
    if cell.get("value") is None:
        return f"{year} — {label}\nDonnée indisponible"
    lines = [f"{year} — {label}", f"Valeur : {cell['value']} {unit}"]
    if cell.get("anomaly") is not None:
        lines.append(f"Écart vs 1991–2020 : {cell['anomaly']:+} {unit}")
    if cell.get("percentile") is not None:
        lines.append(f"Percentile : P{cell['percentile']}")
    if cell.get("class"):
        lines.append(f"Classe : {cell['class']}")
    lines.append(f"Source : {row.get('source', 'réanalyse climatique')}")
    return "\n".join(lines)


def _balance_metrics(rows: list[object], index: int) -> tuple[float, int, int, int]:
    offsets: list[float] = []
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        years = row.get("years", [])
        if not isinstance(years, list) or index >= len(years) or not isinstance(years[index], Mapping):
            continue
        cell = years[index]
        if cell.get("value") is None or cell.get("applicable") is False:
            continue
        offsets.append(_emphasised_position(cell, row.get("reference")) - 0.5)
    count = len(offsets)
    mean = sum(offsets) / count if count else 0.0
    above = sum(offset >= EXCEPTIONAL_OFFSET for offset in offsets)
    below = sum(offset <= -EXCEPTIONAL_OFFSET for offset in offsets)
    return mean, above, below, count


def _balance_cell(rows: list[object], index: int, year: int) -> tuple[str, str]:
    mean, above, below, count = _balance_metrics(rows, index)
    scaled = min(1.0, max(-1.0, mean / BALANCE_FULL_SCALE))
    color = _interpolate_color(COMMON_PALETTE, 0.5 + scaled / 2)
    tooltip = (
        f"{year} — Empreinte bilan\n"
        f"Indice signé : {scaled:+.0%}\n"
        f"Exceptionnellement hauts : {above} / {count}\n"
        f"Exceptionnellement bas : {below} / {count}\n"
        "Un excès et un déficit simultanés se compensent dans l'indice."
    )
    return color, tooltip


def _fingerprint_data(result: Mapping[str, Any]) -> Mapping[str, Any]:
    product = result.get("product")
    method = result.get("method")
    if not isinstance(product, Mapping) or product.get("id") != "climate-fingerprint":
        raise FingerprintRenderError("ClimateResult.product.id doit valoir climate-fingerprint")
    if not isinstance(method, Mapping) or method.get("id") != "climate-fingerprint" or method.get("version") != "4.0.0":
        raise FingerprintRenderError("Le renderer V4 exige climate-fingerprint@4.0.0")
    data = result.get("data")
    if not isinstance(data, Mapping):
        raise FingerprintRenderError("ClimateResult.data doit être un objet")
    return data


def render_fingerprint_data_svg(fingerprint: Mapping[str, Any], *, theme: str = "light") -> str:
    """Rend le SVG V4 depuis le payload scientifique, sans aucun recalcul."""
    rows = fingerprint.get("rows")
    if not isinstance(rows, list) or len(rows) != 6:
        raise FingerprintRenderError("Contrat d'empreinte invalide : six lignes attendues")
    if theme not in THEMES:
        raise FingerprintRenderError(f"Thème de rendu inconnu : {theme!r}")
    palette_theme = THEMES[theme]

    cell_width, cell_height, row_gap = 18, 34, 4
    left, top = 218, 142
    matrix_width = 30 * cell_width
    matrix_height = 7 * cell_height + 6 * row_gap + BALANCE_OFFSET
    width, height, delta_x = 1080, 526, left + matrix_width + 34
    missing, not_applicable = False, False

    def column_x(index: int) -> int:
        return left + index * cell_width

    def band_relief(y: int) -> list[str]:
        if not palette_theme.band_relief:
            return []
        return [
            f'<rect x="{left}" y="{y}" width="{matrix_width}" height="{cell_height}" fill="{BAND_PLATE}" filter="url(#band-shadow)"/>'
        ]

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title description">',
        '<title id="title">L’empreinte climatique du lieu</title>',
        '<desc id="description">Trente années, de 1996 à 2025, pour six indicateurs comparés au climat de référence 1991 à 2020, six séries et un indice d’empreinte bilan annuel.</desc>',
        '<defs><pattern id="missing" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#F1F2F0"/><line x1="0" y1="0" x2="0" y2="6" stroke="#AEB7B3" stroke-width="1.5"/></pattern><pattern id="not-applicable" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#F7F6F2"/><circle cx="2.5" cy="2.5" r="0.8" fill="#AFAFA8"/></pattern>',
        '<filter id="band-shadow" x="-2%" y="-60%" width="104%" height="240%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#1C2529" flood-opacity="0.22"/></filter>',
        '<linearGradient id="common-gradient" x1="0" x2="1" y1="0" y2="0">',
        *[f'<stop offset="{position * 100:.0f}%" stop-color="{color}"/>' for position, color in COMMON_PALETTE],
        '</linearGradient>',
        '</defs>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#24313A}.title{font-size:23px;font-weight:650}.subtitle{font-size:14px;font-weight:500;fill:#52616A}.meta,.year,.legend,.qualifier{font-size:10px;fill:#52616A}.row{font-size:14px;font-weight:650}.delta{font-size:14px;font-weight:650}.comparison-title{font-size:12px;font-weight:650}</style>',
        f'<rect width="{width}" height="{height}" fill="{palette_theme.background}"/>',
        '<text x="40" y="42" class="title">L’empreinte climatique du lieu</text>',
        '<text x="40" y="64" class="subtitle">Qu’est-ce qui a changé en trente ans ?</text>',
        '<text x="40" y="84" class="meta">1996–2025 · référence 1991–2020</text>',
        f'<text x="{delta_x}" y="98" class="comparison-title">Écart entre</text>',
        f'<text x="{delta_x}" y="114" class="comparison-title">les décennies</text>',
    ]

    for decade, start in (("1996–2005", 0), ("2006–2015", 10), ("2016–2025", 20)):
        center = column_x(start) + 5 * cell_width
        parts.append(f'<text x="{center:.1f}" y="108" class="year" text-anchor="middle">{decade}</text>')
    for index, year in enumerate(range(PERIOD_START, PERIOD_END + 1)):
        if year in {1996, 2005, 2015, 2025}:
            x = column_x(index) + cell_width / 2
            parts.append(f'<text x="{x:.1f}" y="127" class="year" text-anchor="middle">{year}</text>')

    comparison = fingerprint.get("comparison", {})
    comparisons = comparison.get("metrics", {}) if isinstance(comparison, Mapping) else {}
    for row_index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            continue
        row_id = str(row.get("id", "temperature"))
        y = top + row_index * (cell_height + row_gap)
        parts.append(
            f'<text x="{left - 14}" y="{y + 21}" class="row" text-anchor="end">{escape(str(row.get("label", "Indicateur")))}</text>'
        )
        parts.extend(band_relief(y))
        years = row.get("years", [])
        if isinstance(years, list):
            for index, cell in enumerate(years):
                if not isinstance(cell, Mapping):
                    continue
                if cell.get("applicable") is False:
                    color, not_applicable = "url(#not-applicable)", True
                elif cell.get("value") is None:
                    color, missing = "url(#missing)", True
                else:
                    color = _cell_color(cell, row.get("reference"))
                x = column_x(index)
                tooltip = escape(_cell_tooltip(row, cell))
                parts.append(
                    f'<rect x="{x}" y="{y}" width="{cell_width}" height="{cell_height}" fill="{color}"><title>{tooltip}</title></rect>'
                )
        metric_comparison = comparisons.get(row_id, {}) if isinstance(comparisons, Mapping) else {}
        delta_label = (
            str(metric_comparison.get("display", "donnée insuffisante"))
            if isinstance(metric_comparison, Mapping)
            else "donnée insuffisante"
        )
        qualifier = str(metric_comparison.get("qualifier", "")) if isinstance(metric_comparison, Mapping) else ""
        parts.append(f'<text x="{delta_x}" y="{y + 18}" class="delta">{escape(delta_label)}</text>')
        if qualifier in {"variabilité élevée", "pas d’évolution nette"}:
            parts.append(f'<text x="{delta_x}" y="{y + 32}" class="qualifier">{escape(qualifier)}</text>')

    balance_y = top + 6 * (cell_height + row_gap) + BALANCE_OFFSET
    parts.append(
        f'<text x="{left - 14}" y="{balance_y + 21}" class="row" text-anchor="end">Empreinte bilan</text>'
    )
    parts.extend(band_relief(balance_y))
    for index, year in enumerate(range(PERIOD_START, PERIOD_END + 1)):
        color, tooltip = _balance_cell(rows, index, year)
        x = column_x(index)
        parts.append(
            f'<rect x="{x}" y="{balance_y}" width="{cell_width}" height="{cell_height}" fill="{color}"><title>{escape(tooltip)}</title></rect>'
        )

    for boundary in (10, 20):
        filet_x = column_x(boundary)
        parts.append(
            f'<line x1="{filet_x}" y1="{top - 4}" x2="{filet_x}" y2="{balance_y + cell_height + 4}" stroke="#24313A" stroke-width="1" stroke-dasharray="2 3" opacity="0.45"/>'
        )

    matrix_center = left + matrix_width / 2
    bar_width = 220
    bar_x = matrix_center - bar_width / 2
    legend_y = top + matrix_height + 44
    parts.append(
        f'<text x="{matrix_center:.1f}" y="{legend_y - 7}" class="legend" text-anchor="middle">Écart à la référence 1991–2020, accentué sur les extrêmes</text>'
    )
    parts.append(
        f'<text x="{bar_x - 10:.1f}" y="{legend_y + 12}" class="legend" text-anchor="end">−3 σ</text>'
    )
    parts.append(
        f'<rect x="{bar_x:.1f}" y="{legend_y + 3}" width="{bar_width}" height="10" fill="url(#common-gradient)"/>'
    )
    parts.append(
        f'<text x="{bar_x + bar_width + 10:.1f}" y="{legend_y + 12}" class="legend">+3 σ</text>'
    )
    parts.append(
        f'<text x="{matrix_center:.1f}" y="{legend_y + 27}" class="legend" text-anchor="middle">une année ordinaire reste blanche · seul l’exceptionnel se colore</text>'
    )
    if missing or not_applicable:
        states: list[str] = []
        if missing:
            states.append("hachures : donnée indisponible")
        if not_applicable:
            states.append("points : indicateur non pertinent")
        parts.append(
            f'<text x="{matrix_center:.1f}" y="{legend_y + 44}" class="legend" text-anchor="middle">{escape(" · ".join(states))}</text>'
        )
    parts.append("</svg>")
    return "\n".join(parts)


def render_fingerprint_result_svg(result: Mapping[str, Any], *, theme: str = "light") -> str:
    """Rend un ClimateResult P6 validé sans modifier ClimateResult.data."""
    return render_fingerprint_data_svg(_fingerprint_data(result), theme=theme)


def write_fingerprint_result_svg(
    result: Mapping[str, Any],
    output_path: Path,
    *,
    theme: str = "light",
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_fingerprint_result_svg(result, theme=theme) + "\n", encoding="utf-8")
    return output_path
