"""Rendu SVG P7 de « L'eau au fil de l'année ».

Le renderer applique la doctrine de visualisation documentée dans
``doc/climat/methods/water-through-year/v1/visualization.md``.
Il ne réalise aucune agrégation scientifique : il met en forme les médianes,
P25/P75 et comparaisons déjà sérialisées dans ``ClimateResult.data``.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any, Mapping, Sequence

METHOD = {"id": "water-through-year", "version": "1.0.0"}
MONTH_KEYS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
MONTHS = ("JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC")
EARLY, LATE = "1996-2005", "2016-2025"

WIDTH, HEIGHT = 1120, 985
BAND_X, BAND_WIDTH, BAND_HEIGHT = 40, 1040, 205
BAND_YS = (110, 325, 540, 755)
PLOT_X, PLOT_WIDTH = 300, 560
CELL = PLOT_WIDTH / 12
SUMMARY_X = 900

EARLY_COLOR = "#2166AC"
LATE_COLOR = "#B2182B"
TEXT = "#24313A"
MUTED = "#52616A"
GRID = "#9DA5A4"
PAPER = "#FBFAF7"
BACKGROUND = "#C5C4C1"
THRESHOLD = "#9A6238"

VARIABLES = (
    {
        "slug": "precipitation",
        "title": "Précipitations",
        "question": "Quand tombe l’eau ?",
        "unit": "mm/mois",
        "key": "precipitation_mm",
        "summary_key": "annual_precip_change_pct",
        "summary_label": "Pluie annuelle",
        "summary_unit": "%",
    },
    {
        "slug": "soil-water",
        "title": "Stock d’eau du sol modélisé",
        "question": "Quand le sol modélisé est-il le plus humide ?",
        "unit": "mm · 0–100 cm",
        "key": "soil_water_0_100_mm",
        "summary_key": "summer_soil_water_change_mm",
        "summary_label": "Stock estival modélisé",
        "summary_unit": "mm",
    },
    {
        "slug": "evapotranspiration",
        "title": "Évapotranspiration modélisée",
        "question": "Quand l’eau repart-elle vers l’atmosphère ?",
        "unit": "mm/mois",
        "key": "actual_evapotranspiration_mm",
        "summary_key": None,
        "summary_label": None,
        "summary_unit": None,
    },
    {
        "slug": "spei3",
        "title": "Indice SPEI-3",
        "question": "Quand le contexte est-il plus sec ou plus humide ?",
        "unit": "indice standardisé",
        "key": "spei3",
        "summary_key": "dry_months_change",
        "summary_label": "Mois secs SPEI-3",
        "summary_unit": "mois/an",
    },
)


def _fmt(value: float | None, digits: int = 1) -> str:
    return "—" if value is None else f"{float(value):.{digits}f}".replace(".", ",")


def _monthly(document: Mapping[str, Any], period: str) -> list[Mapping[str, Any]]:
    source = document.get("monthly", {}).get(period, {})
    return [source.get(month, {}) for month in MONTH_KEYS]


def _series(records: Sequence[Mapping[str, Any]], key: str, statistic: str) -> list[float | None]:
    field = f"{key}_{statistic}"
    return [None if item.get(field) is None else float(item[field]) for item in records]


def _main_domain(early: Sequence[Mapping[str, Any]], late: Sequence[Mapping[str, Any]], key: str) -> tuple[float, float]:
    values: list[float] = []
    for records in (early, late):
        for stat in ("p25", "median", "p75"):
            values.extend(value for value in _series(records, key, stat) if value is not None)

    if not values:
        return 0.0, 1.0

    low, high = min(values), max(values)
    if key == "spei3":
        extent = max(abs(low), abs(high), 1.25)
        return -extent, extent

    if key in {"precipitation_mm", "actual_evapotranspiration_mm"}:
        span = max(high, 1.0)
        return 0.0, high + span * 0.08

    span = max(high - low, 1.0)
    return low - span * 0.08, high + span * 0.08


def _delta_values(
    early: Sequence[Mapping[str, Any]],
    late: Sequence[Mapping[str, Any]],
    key: str,
) -> list[float | None]:
    early_median = _series(early, key, "median")
    late_median = _series(late, key, "median")
    return [
        None if a is None or b is None else b - a
        for a, b in zip(early_median, late_median, strict=True)
    ]


def _delta_extent(values: Sequence[float | None]) -> float:
    valid = [abs(float(value)) for value in values if value is not None]
    return max(max(valid, default=0.0) * 1.12, 0.5)


def _x(index: int) -> float:
    return PLOT_X + index * CELL + CELL / 2


def _y(value: float, low: float, high: float, top: float, height: float) -> float:
    if high == low:
        return top + height / 2
    ratio = (value - low) / (high - low)
    return top + height - max(0.0, min(1.0, ratio)) * height


def _line_path(values: Sequence[float | None], low: float, high: float, top: float, height: float) -> str:
    parts: list[str] = []
    open_segment = False
    for index, value in enumerate(values):
        if value is None:
            open_segment = False
            continue
        command = "L" if open_segment else "M"
        parts.append(f"{command}{_x(index):.1f},{_y(float(value), low, high, top, height):.1f}")
        open_segment = True
    return " ".join(parts)


def _range_paths(
    p25: Sequence[float | None],
    p75: Sequence[float | None],
    low: float,
    high: float,
    top: float,
    height: float,
) -> list[str]:
    paths: list[str] = []
    start: int | None = None

    def close_segment(segment_start: int, segment_end: int) -> None:
        upper = [
            f"{_x(index):.1f},{_y(float(p75[index]), low, high, top, height):.1f}"
            for index in range(segment_start, segment_end + 1)
        ]
        lower = [
            f"{_x(index):.1f},{_y(float(p25[index]), low, high, top, height):.1f}"
            for index in range(segment_end, segment_start - 1, -1)
        ]
        paths.append("M" + " L".join(upper + lower) + " Z")

    for index, (lo, hi) in enumerate(zip(p25, p75, strict=True)):
        valid = lo is not None and hi is not None
        if valid and start is None:
            start = index
        if start is not None and (not valid or index == len(p25) - 1):
            end = index if valid and index == len(p25) - 1 else index - 1
            if end >= start:
                close_segment(start, end)
            start = None
    return paths


def _summary_text(value: float | None, unit: str) -> str:
    if value is None:
        return "donnée insuffisante"
    direction = "de plus" if value > 0 else "de moins" if value < 0 else "sans écart"
    if value == 0:
        return direction
    if unit == "mois/an":
        return f"{_fmt(abs(value), 1)} mois {direction} / an"
    return f"{_fmt(abs(value), 1)} {unit} {direction}"


def _band(
    document: Mapping[str, Any],
    config: Mapping[str, Any],
    y: float,
) -> str:
    early = _monthly(document, EARLY)
    late = _monthly(document, LATE)
    key = str(config["key"])
    low, high = _main_domain(early, late, key)
    delta = _delta_values(early, late, key)
    delta_extent = _delta_extent(delta)

    main_top, main_height = y + 42, 70
    month_y = y + 128
    delta_label_y = y + 150
    delta_top, delta_height = y + 158, 34
    delta_zero = delta_top + delta_height / 2

    early_median = _series(early, key, "median")
    late_median = _series(late, key, "median")
    early_p25, early_p75 = _series(early, key, "p25"), _series(early, key, "p75")
    late_p25, late_p75 = _series(late, key, "p25"), _series(late, key, "p75")

    parts = [
        f'<g class="band" data-band="{escape(str(config["slug"]))}">',
        f'<rect class="band-background" x="{BAND_X}" y="{y}" width="{BAND_WIDTH}" height="{BAND_HEIGHT}" rx="3"/>',
        f'<text x="64" y="{y + 31}" class="band-title">{escape(str(config["title"]))}</text>',
        f'<text x="64" y="{y + 53}" class="question">{escape(str(config["question"]))}</text>',
        f'<text x="64" y="{y + 75}" class="unit">{escape(str(config["unit"]))}</text>',
        f'<line x1="520" y1="{y + 22}" x2="545" y2="{y + 22}" class="early-line"/>',
        f'<text x="552" y="{y + 26}" class="legend-text">1996–2005</text>',
        f'<line x1="640" y1="{y + 22}" x2="665" y2="{y + 22}" class="late-line"/>',
        f'<text x="672" y="{y + 26}" class="legend-text">2016–2025</text>',
        f'<rect x="770" y="{y + 16}" width="22" height="9" class="range-swatch"/>',
        f'<text x="798" y="{y + 26}" class="legend-text">P25–P75</text>',
    ]

    for index, month in enumerate(MONTHS):
        cx = _x(index)
        parts.append(
            f'<line x1="{cx:.1f}" y1="{main_top}" x2="{cx:.1f}" y2="{delta_top + delta_height}" class="month-guide"/>'
        )
        parts.append(f'<text x="{cx:.1f}" y="{month_y}" class="month" text-anchor="middle">{month}</text>')

    parts.append(
        f'<line x1="{PLOT_X}" y1="{main_top + main_height}" x2="{PLOT_X + PLOT_WIDTH}" y2="{main_top + main_height}" class="axis-line"/>'
    )
    if key == "spei3":
        for value, label, cls in ((0.0, "0", "spei-zero"), (-1.0, "−1", "dry-threshold")):
            yy = _y(value, low, high, main_top, main_height)
            parts.append(
                f'<line x1="{PLOT_X}" y1="{yy:.1f}" x2="{PLOT_X + PLOT_WIDTH}" y2="{yy:.1f}" class="{cls}"/>'
            )
            parts.append(f'<text x="{PLOT_X - 8}" y="{yy + 3:.1f}" class="axis-label" text-anchor="end">{label}</text>')

    for path in _range_paths(early_p25, early_p75, low, high, main_top, main_height):
        parts.append(f'<path d="{path}" class="range early-range"/>')
    for path in _range_paths(late_p25, late_p75, low, high, main_top, main_height):
        parts.append(f'<path d="{path}" class="range late-range"/>')

    early_path = _line_path(early_median, low, high, main_top, main_height)
    late_path = _line_path(late_median, low, high, main_top, main_height)
    if early_path:
        parts.append(f'<path d="{early_path}" class="profile early-line"/>')
    if late_path:
        parts.append(f'<path d="{late_path}" class="profile late-line"/>')

    parts.append(
        f'<text x="{PLOT_X}" y="{delta_label_y}" class="delta-label">Écart 2016–2025 − 1996–2005</text>'
    )
    parts.append(
        f'<line x1="{PLOT_X}" y1="{delta_zero:.1f}" x2="{PLOT_X + PLOT_WIDTH}" y2="{delta_zero:.1f}" class="delta-zero"/>'
    )
    parts.append(f'<text x="{PLOT_X + PLOT_WIDTH + 8}" y="{delta_zero - 5:.1f}" class="delta-direction">plus</text>')
    parts.append(f'<text x="{PLOT_X + PLOT_WIDTH + 8}" y="{delta_zero + 12:.1f}" class="delta-direction">moins</text>')

    half = delta_height / 2 - 2
    for index, value in enumerate(delta):
        if value is None:
            continue
        magnitude = min(abs(float(value)) / delta_extent, 1.0) * half
        bar_y = delta_zero - magnitude if value >= 0 else delta_zero
        parts.append(
            f'<rect class="delta-bar" data-month="{MONTH_KEYS[index]}" x="{_x(index) - 5:.1f}" '
            f'y="{bar_y:.1f}" width="10" height="{magnitude:.1f}"><title>'
            f'{MONTHS[index]} · écart {_fmt(value, 1)} {escape(str(config["unit"]))}</title></rect>'
        )

    summary_key = config.get("summary_key")
    if summary_key:
        value = document.get("comparison", {}).get(summary_key)
        parts.append(
            f'<text x="{SUMMARY_X}" y="{y + 48}" class="summary-label">{escape(str(config["summary_label"]))}</text>'
        )
        parts.append(
            f'<text x="{SUMMARY_X}" y="{y + 72}" class="summary-value">'
            f'{escape(_summary_text(None if value is None else float(value), str(config["summary_unit"])))}</text>'
        )
        parts.append(
            f'<text x="{SUMMARY_X}" y="{y + 91}" class="summary-note">2016–2025 vs 1996–2005</text>'
        )

    if key == "spei3":
        parts.append(
            f'<text x="{SUMMARY_X}" y="{y + 132}" class="threshold-note">Seuil des mois secs :</text>'
        )
        parts.append(
            f'<text x="{SUMMARY_X}" y="{y + 148}" class="threshold-note">SPEI-3 &lt; −1</text>'
        )

    parts.append("</g>")
    return "".join(parts)


def render_water_through_year_svg(document: Mapping[str, Any]) -> str:
    """Met en forme uniquement les résultats scientifiques déjà sérialisés."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="water-title water-desc">',
        '<title id="water-title">L’eau au fil de l’année</title>',
        '<desc id="water-desc">Quatre lectures du cycle hydroclimatique. Le cycle saisonnier domine ; les écarts entre 1996–2005 et 2016–2025 sont montrés mois par mois sans amplification graphique.</desc>',
        '<defs><filter id="soft-shadow" x="-5%" y="-10%" width="110%" height="125%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#1C2529" flood-opacity=".16"/></filter></defs>',
        (
            "<style>"
            "text{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#24313A}"
            ".title{font-size:24px;font-weight:650}"
            ".meta{font-size:12px;fill:#52616A}"
            ".band-background{fill:#FBFAF7;filter:url(#soft-shadow)}"
            ".band-title{font-size:16px;font-weight:650}"
            ".question{font-size:11px;fill:#52616A}"
            ".unit,.month,.legend-text,.axis-label,.delta-label,.delta-direction,.summary-label,.summary-note,.threshold-note{font-size:10px;fill:#52616A}"
            ".summary-value{font-size:15px;font-weight:650}"
            ".month-guide{stroke:#9DA5A4;stroke-width:.45;stroke-dasharray:1 4;opacity:.42}"
            ".axis-line{stroke:#9DA5A4;stroke-width:.6;opacity:.65}"
            ".range{stroke:none}"
            ".early-range{fill:#2166AC;opacity:.10}"
            ".late-range{fill:#B2182B;opacity:.08}"
            ".range-swatch{fill:#52616A;opacity:.12}"
            ".profile{fill:none;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}"
            ".early-line{fill:none;stroke:#2166AC;stroke-width:2.2}"
            ".late-line{fill:none;stroke:#B2182B;stroke-width:2.2;stroke-dasharray:6 4}"
            ".delta-zero{stroke:#52616A;stroke-width:.8;opacity:.8}"
            ".delta-bar{fill:#52616A;opacity:.72}"
            ".spei-zero{stroke:#52616A;stroke-width:.7;opacity:.55}"
            ".dry-threshold{stroke:#9A6238;stroke-width:1.1;stroke-dasharray:4 3}"
            ".threshold-note{fill:#9A6238}"
            "</style>"
        ),
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{BACKGROUND}"/>',
        '<text x="40" y="42" class="title">L’eau au fil de l’année</text>',
        '<text x="40" y="66" class="meta">Le cycle saisonnier domine ; les écarts entre décennies sont localisés.</text>',
        '<text x="40" y="88" class="meta">Comparaison 1996–2005 / 2016–2025 · ERA5-Land + ERA5-Drought</text>',
    ]
    for config, y in zip(VARIABLES, BAND_YS, strict=True):
        parts.append(_band(document, config, y))
    parts.append("</svg>")
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
