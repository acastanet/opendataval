"""Rendu SVG éditorial ; il ne calcule ni agrégation, ni indicateur scientifique."""

from __future__ import annotations

from html import escape

MONTHS = ("JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC")
WIDTH, HEIGHT = 1120, 450
LEFT, PLOT_WIDTH, RIGHT_X = 118, 700, 862
CELL = PLOT_WIDTH / 12
PROFILE_TOPS = (145, 287)
SOIL_COLORS = ((20, "#9A6238"), (40, "#E6C7A3"), (60, "#FBFAF7"), (80, "#92C5DE"), (101, "#2166AC"))


def _fmt(value: float | None, digits: int = 0) -> str:
    return "—" if value is None else f"{float(value):.{digits}f}".replace(".", ",")


def _color(percentile: float | None) -> str:
    if percentile is None:
        return "#E4E1DC"
    return next(color for edge, color in SOIL_COLORS if percentile < edge)


def _tooltip(month: str, label: str, data: dict) -> str:
    return escape(
        f"{month.title()} · {label}\n\n"
        f"Précipitations : {_fmt(data.get('precipitation_mm_median'))} mm/mois\n"
        f"P25–P75 : {_fmt(data.get('precipitation_mm_p25'))}–{_fmt(data.get('precipitation_mm_p75'))} mm\n"
        f"Stock d’eau modélisé 0–100 cm : {_fmt(data.get('soil_water_0_100_mm_median'))} mm\n"
        f"Évapotranspiration réelle : {_fmt(data.get('actual_evapotranspiration_mm_median'))} mm/mois\n"
        f"SPEI-3 : {_fmt(data.get('spei3_median'), 2)}\n\n"
        "Sources : ERA5-Land / ERA5-Drought"
    )


def _scales(document: dict) -> tuple[float, float, float, float, float, float]:
    records = [item for label in ("1996-2005", "2016-2025") for item in document["monthly"].get(label, {}).values()]
    def maximum(key: str, fallback: float) -> float:
        vals = [float(entry[key]) for entry in records if entry.get(key) is not None]
        return max(vals) if vals else fallback
    soil_values = [float(entry["soil_water_0_100_mm_median"]) for entry in records if entry.get("soil_water_0_100_mm_median") is not None]
    return maximum("precipitation_mm_median", 1), max(min(soil_values, default=0), 0), max(soil_values, default=1), maximum("actual_evapotranspiration_mm_median", 1), 0, 1


def _comparison_block(comparison: dict) -> str:
    items = (
        ("Pluie annuelle", comparison.get("annual_precip_change_pct"), "%", True),
        ("Stock du sol en été", comparison.get("summer_soil_water_change_mm"), "mm", False),
        ("Déficit SPEI-3", comparison.get("dry_months_change"), "mois/an", False),
    )
    parts = ['<text x="862" y="148" class="compare-title">Écart entre</text>',
             '<text x="862" y="164" class="compare-title">les décennies</text>']
    y = 198
    for label, value, unit, percentage in items:
        parts.append(f'<text x="862" y="{y}" class="compare-label">{label}</text>')
        if value is None:
            display = "donnée insuffisante"
        else:
            sign = "+" if value > 0 else "−" if value < 0 else ""
            digits = 0 if abs(float(value)) >= 10 else 1
            display = f"{sign}{_fmt(abs(float(value)), digits)} {unit}"
        parts.append(f'<text x="862" y="{y + 21}" class="compare-value">{escape(display)}</text>')
        y += 66
    return "".join(parts)


def _profile(label: str, data: dict, top: float, precip_max: float, soil_min: float, soil_max: float, eta_max: float) -> str:
    parts = [f'<text x="{LEFT - 12}" y="{top + 54}" class="period" text-anchor="end">{label}</text>']
    for index, (month, entry) in enumerate(zip(MONTHS, data.values(), strict=True)):
        x = LEFT + index * CELL
        cx = x + CELL / 2
        tip = _tooltip(month, label, entry)
        precip = entry.get("precipitation_mm_median")
        if precip is not None:
            height = 36 * float(precip) / precip_max if precip_max else 0
            parts.append(f'<rect x="{cx - 7:.1f}" y="{top + 42 - height:.1f}" width="14" height="{height:.1f}" fill="#2166AC"><title>{tip}</title></rect>')
        soil = entry.get("soil_water_0_100_mm_median")
        if soil is None:
            soil_height, soil_y, color = 12, top + 48, "#E4E1DC"
        else:
            ratio = 0.5 if soil_max == soil_min else (float(soil) - soil_min) / (soil_max - soil_min)
            soil_height = 17 + 27 * max(0, min(1, ratio))
            soil_y, color = top + 95 - soil_height, _color(entry.get("soil_water_reference_percentile_median"))
        parts.append(f'<rect x="{x + 1:.1f}" y="{soil_y:.1f}" width="{CELL - 2:.1f}" height="{soil_height:.1f}" fill="{color}"><title>{tip}</title></rect>')
        eta = entry.get("actual_evapotranspiration_mm_median")
        if eta is not None:
            height = 24 * float(eta) / eta_max if eta_max else 0
            parts.append(f'<rect x="{cx - 5:.1f}" y="{top + 102:.1f}" width="10" height="{height:.1f}" fill="#A67C52"><title>{tip}</title></rect>')
        spei = entry.get("spei3_median")
        spei_color = "#E4E1DC" if spei is None else "#2166AC" if float(spei) >= 0.5 else "#9A6238" if float(spei) <= -0.5 else "#FBFAF7"
        parts.append(f'<rect x="{x + 1:.1f}" y="{top + 132:.1f}" width="{CELL - 2:.1f}" height="8" fill="{spei_color}" stroke="#9DA5A4" stroke-width=".35"><title>{tip}</title></rect>')
    return "".join(parts)


def render_water_through_year_svg(document: dict) -> str:
    """Affiche les médianes déjà sérialisées dans le document JSON."""
    precip_max, soil_min, soil_max, eta_max, _, _ = _scales(document)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="water-title water-desc">',
        '<title id="water-title">L’eau au fil de l’année</title>',
        '<desc id="water-desc">Deux profils hydriques mensuels comparant 1996–2005 et 2016–2025 : précipitations, stock d’eau modélisé dans les 0–100 cm, évapotranspiration réelle et SPEI-3.</desc>',
        '<defs><filter id="soft-shadow" x="-5%" y="-10%" width="110%" height="125%"><feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#1C2529" flood-opacity=".2"/></filter></defs>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;fill:#24313A}.title{font-size:23px;font-weight:650}.meta{font-size:12px;fill:#52616A}.month{font-size:9px;fill:#52616A}.period{font-size:13px;font-weight:650}.key{font-size:10px;fill:#52616A}.compare-title{font-size:14px;font-weight:650}.compare-label{font-size:11px;fill:#52616A}.compare-value{font-size:16px;font-weight:650}</style>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#C5C4C1"/>',
        '<text x="40" y="40" class="title">L’eau au fil de l’année</text>',
        '<text x="40" y="63" class="meta">La pluie n’est qu’une partie de l’histoire.</text>',
        '<text x="40" y="88" class="meta">1996–2025 · référence 1991–2020 · ERA5-Land + ERA5-Drought</text>',
        f'<g filter="url(#soft-shadow)"><rect x="{LEFT}" y="188" width="{PLOT_WIDTH}" height="52" fill="#1C2529" opacity=".12"/><rect x="{LEFT}" y="330" width="{PLOT_WIDTH}" height="52" fill="#1C2529" opacity=".12"/></g>',
    ]
    for index, month in enumerate(MONTHS):
        x = LEFT + index * CELL + CELL / 2
        parts.append(f'<text x="{x:.1f}" y="122" class="month" text-anchor="middle">{month}</text>')
        parts.append(f'<line x1="{LEFT + index * CELL:.1f}" y1="128" x2="{LEFT + index * CELL:.1f}" y2="382" stroke="#52616A" stroke-width=".45" stroke-dasharray="1 3" opacity=".42"/>')
    parts.append(f'<line x1="{LEFT + PLOT_WIDTH:.1f}" y1="128" x2="{LEFT + PLOT_WIDTH:.1f}" y2="382" stroke="#52616A" stroke-width=".45" stroke-dasharray="1 3" opacity=".42"/>')
    parts.append('<text x="40" y="180" class="key">pluie</text><text x="40" y="207" class="key">stock du sol</text><text x="40" y="228" class="key">évapotranspiration</text><text x="40" y="242" class="key">SPEI-3</text>')
    parts.append(_profile("1996–2005", document["monthly"].get("1996-2005", {}), PROFILE_TOPS[0], precip_max, soil_min, soil_max, eta_max))
    parts.append(_profile("2016–2025", document["monthly"].get("2016-2025", {}), PROFILE_TOPS[1], precip_max, soil_min, soil_max, eta_max))
    parts.append(_comparison_block(document.get("comparison", {})))
    parts.append('</svg>')
    return "\n".join(parts)
