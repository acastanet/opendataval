from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping


def _fmt_fr(value: object, digits: int = 0) -> str:
    if not isinstance(value, (int, float)):
        return "—"
    rendered = f"{float(value):.{digits}f}".replace(".", ",")
    if digits == 0:
        rendered = f"{int(round(float(value))):,}".replace(",", " ")
    return rendered


def render_climate_overview_svg(
    monthly_data: list,
    annual_data: dict,
    title: str = "Le climat de la zone",
) -> str:
    """Renderer V1 neutral conforme à visualization.md, sans recalcul scientifique."""
    width = 800
    height = 540
    padding_top = 140
    padding_bottom = 90
    padding_left = 72
    padding_right = 72

    graph_width = width - padding_left - padding_right
    graph_height = height - padding_top - padding_bottom
    months = ["JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC"]

    t_values = [
        float(m["temperature_c"]["mean"])
        for m in monthly_data
        if m["temperature_c"]["mean"] is not None
    ]
    p_values = [
        float(m["precipitation_mm"]["mean"])
        for m in monthly_data
        if m["precipitation_mm"]["mean"] is not None
    ]

    min_t = min(t_values) - 5 if t_values else 0
    max_t = max(t_values) + 5 if t_values else 30
    max_p = max(p_values) * 1.2 if p_values else 100
    if max_p == 0:
        max_p = 100

    def get_y_t(val: object) -> float | None:
        if not isinstance(val, (int, float)):
            return None
        return padding_top + graph_height - ((float(val) - min_t) / (max_t - min_t) * graph_height)

    def get_y_p(val: object) -> float | None:
        if not isinstance(val, (int, float)):
            return None
        return padding_top + graph_height - (float(val) / max_p * graph_height)

    svg: list[str] = []
    svg.append(
        f'<svg viewBox="0 0 {width} {height}" width="100%" height="100%" '
        'xmlns="http://www.w3.org/2000/svg" role="img" '
        'aria-labelledby="climate-overview-title climate-overview-desc">'
    )
    svg.append(f'<title id="climate-overview-title">{title}</title>')
    svg.append(
        f'<desc id="climate-overview-desc">Climat habituel 1991–2020 : '
        f'{annual_data.get("mean_temperature_c")} °C en moyenne annuelle et '
        f'{annual_data.get("precipitation_mm")} mm de précipitations annuelles.</desc>'
    )
    svg.append('<rect width="100%" height="100%" fill="#C5C4C1" />')
    svg.append(
        f'<text x="{padding_left}" y="40" font-family="system-ui, sans-serif" '
        f'font-size="24" font-weight="bold" fill="#24313A">{title}</text>'
    )
    svg.append(
        f'<text x="{padding_left}" y="65" font-family="system-ui, sans-serif" '
        'font-size="14" fill="#52616A">Le rythme habituel de la température et des précipitations au fil de l’année.</text>'
    )
    svg.append(
        f'<text x="{padding_left}" y="86" font-family="system-ui, sans-serif" '
        'font-size="12" fill="#52616A">Référence 1991–2020 · données de réanalyse Copernicus</text>'
    )

    svg.append(
        f'<line x1="{padding_left}" y1="112" x2="{padding_left + 24}" y2="112" '
        'stroke="#B2182B" stroke-width="3"/>'
    )
    svg.append(
        f'<text x="{padding_left + 32}" y="116" font-family="system-ui, sans-serif" '
        'font-size="11" fill="#52616A">Température moyenne · zone P10–P90</text>'
    )
    svg.append(
        f'<rect x="{padding_left + 302}" y="105" width="16" height="10" fill="#2166AC" opacity="0.8"/>'
    )
    svg.append(
        f'<text x="{padding_left + 326}" y="116" font-family="system-ui, sans-serif" '
        'font-size="11" fill="#52616A">Précipitations moyennes</text>'
    )
    svg.append(
        f'<text x="{padding_left}" y="{padding_top - 10}" font-family="system-ui, sans-serif" '
        'font-size="11" font-weight="600" fill="#B2182B">Température (°C)</text>'
    )
    svg.append(
        f'<text x="{width - padding_right}" y="{padding_top - 10}" font-family="system-ui, sans-serif" '
        'font-size="11" font-weight="600" fill="#2166AC" text-anchor="end">Précipitations (mm/mois)</text>'
    )

    graph_bottom = padding_top + graph_height
    svg.append(
        f'<line x1="{padding_left}" y1="{graph_bottom}" '
        f'x2="{width-padding_right}" y2="{graph_bottom}" stroke="#52616A" stroke-width="1" />'
    )

    bar_width = graph_width / 24
    for i, m in enumerate(monthly_data):
        val = m["precipitation_mm"]["mean"]
        y = get_y_p(val)
        if y is not None:
            x = padding_left + (i + 0.5) * (graph_width / 12) - bar_width / 2
            h = graph_bottom - y
            svg.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{h:.1f}" '
                'fill="#2166AC" opacity="0.8" />'
            )

    env_points: list[str] = []
    for i, m in enumerate(monthly_data):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        y = get_y_t(m["temperature_c"]["p90"])
        if y is not None:
            env_points.append(f"{x:.1f},{y:.1f}")
    for i, m in reversed(list(enumerate(monthly_data))):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        y = get_y_t(m["temperature_c"]["p10"])
        if y is not None:
            env_points.append(f"{x:.1f},{y:.1f}")
    if env_points:
        svg.append(f'<polygon points="{" ".join(env_points)}" fill="#B2182B" opacity="0.16" />')

    line_points: list[str] = []
    for i, m in enumerate(monthly_data):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        y = get_y_t(m["temperature_c"]["mean"])
        if y is not None:
            line_points.append(f"{x:.1f},{y:.1f}")
    if line_points:
        svg.append(
            f'<polyline points="{" ".join(line_points)}" fill="none" '
            'stroke="#B2182B" stroke-width="3" />'
        )

    for i, month in enumerate(months):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        svg.append(
            f'<text x="{x:.1f}" y="{graph_bottom + 22}" font-family="system-ui, sans-serif" '
            f'font-size="10" fill="#24313A" text-anchor="middle">{month}</text>'
        )

    for i in range(6):
        val = min_t + i * (max_t - min_t) / 5
        y = get_y_t(val)
        svg.append(
            f'<text x="{padding_left - 10}" y="{y + 4:.1f}" font-family="system-ui, sans-serif" '
            f'font-size="11" fill="#B2182B" text-anchor="end">{int(round(val))}°</text>'
        )

    for i in range(6):
        val = i * max_p / 5
        y = get_y_p(val)
        svg.append(
            f'<text x="{width - padding_right + 10}" y="{y + 4:.1f}" font-family="system-ui, sans-serif" '
            f'font-size="11" fill="#2166AC" text-anchor="start">{int(round(val))}</text>'
        )

    summary_y = height - 24
    svg.append(
        f'<text x="{padding_left}" y="{summary_y}" font-family="system-ui, sans-serif" '
        'font-size="15" font-weight="650" fill="#24313A">'
        f'{_fmt_fr(annual_data.get("mean_temperature_c"), 1)} °C '
        '<tspan font-size="11" font-weight="400" fill="#52616A">moyenne annuelle</tspan></text>'
    )
    svg.append(
        f'<text x="{width - padding_right}" y="{summary_y}" font-family="system-ui, sans-serif" '
        'font-size="15" font-weight="650" fill="#24313A" text-anchor="end">'
        f'{_fmt_fr(annual_data.get("precipitation_mm"), 0)} mm '
        '<tspan font-size="11" font-weight="400" fill="#52616A">sur l’année</tspan></text>'
    )

    svg.append("</svg>")
    return "\n".join(svg)


def render_overview_result_svg(result: Mapping[str, Any]) -> str:
    method = result.get("method") or {}
    if method.get("id") != "climate-overview" or method.get("version") != "1.0.0":
        raise ValueError("ClimateResult incompatible avec climate-overview@1.0.0")
    data = result.get("data")
    if not isinstance(data, Mapping):
        raise ValueError("ClimateResult.data absent")
    monthly = data.get("monthly")
    annual = data.get("annual")
    if not isinstance(monthly, list) or not isinstance(annual, Mapping):
        raise ValueError("Payload overview incomplet")
    return render_climate_overview_svg(monthly, dict(annual))


def write_overview_result_svg(result: Mapping[str, Any], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_overview_result_svg(result), encoding="utf-8")
    return output
