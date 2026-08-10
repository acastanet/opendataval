from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping


def render_climate_overview_svg(monthly_data: list, annual_data: dict, title: str = "Le climat de la zone") -> str:
    """Renderer V1 neutral, port fidèle du POC historique."""
    width = 800
    height = 500
    padding_top = 100
    padding_bottom = 60
    padding_left = 60
    padding_right = 60

    graph_width = width - padding_left - padding_right
    graph_height = height - padding_top - padding_bottom
    months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

    t_values = []
    p_values = []
    for m in monthly_data:
        if m["temperature_c"]["mean"] is not None:
            t_values.append(m["temperature_c"]["mean"])
        if m["precipitation_mm"]["mean"] is not None:
            p_values.append(m["precipitation_mm"]["mean"])

    min_t = min(t_values) - 5 if t_values else 0
    max_t = max(t_values) + 5 if t_values else 30
    max_p = max(p_values) * 1.2 if p_values else 100
    if max_p == 0:
        max_p = 100

    def get_y_t(val):
        if val is None:
            return None
        return padding_top + graph_height - ((val - min_t) / (max_t - min_t) * graph_height)

    def get_y_p(val):
        if val is None:
            return None
        return padding_top + graph_height - (val / max_p * graph_height)

    svg = []
    svg.append(f'<svg viewBox="0 0 {width} {height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="climate-overview-title climate-overview-desc">')
    svg.append(f'<title id="climate-overview-title">{title}</title>')
    svg.append(f'<desc id="climate-overview-desc">Climatogramme avec une température moyenne annuelle de {annual_data.get("mean_temperature_c")}°C et {annual_data.get("precipitation_mm")} mm de précipitations annuelles.</desc>')
    svg.append('<rect width="100%" height="100%" fill="#C5C4C1" />')
    svg.append(f'<text x="{padding_left}" y="40" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="#24313A">{title}</text>')
    svg.append(f'<text x="{padding_left}" y="65" font-family="system-ui, sans-serif" font-size="14" fill="#52616A">Le rythme habituel de la température et des précipitations au fil de l’année.</text>')
    svg.append(f'<text x="{padding_left}" y="85" font-family="system-ui, sans-serif" font-size="12" fill="#52616A">Référence 1991–2020 · données de réanalyse Copernicus</text>')
    svg.append(f'<line x1="{padding_left}" y1="{padding_top+graph_height}" x2="{width-padding_right}" y2="{padding_top+graph_height}" stroke="#52616A" stroke-width="1" />')

    bar_width = graph_width / 24
    for i, m in enumerate(monthly_data):
        val = m["precipitation_mm"]["mean"]
        if val is not None:
            x = padding_left + (i + 0.5) * (graph_width / 12) - bar_width / 2
            y = get_y_p(val)
            h = padding_top + graph_height - y
            svg.append(f'<rect x="{x}" y="{y}" width="{bar_width}" height="{h}" fill="#2166AC" opacity="0.8" />')

    env_points = []
    for i, m in enumerate(monthly_data):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        y = get_y_t(m["temperature_c"]["p90"])
        if y is not None:
            env_points.append(f"{x},{y}")
    for i, m in reversed(list(enumerate(monthly_data))):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        y = get_y_t(m["temperature_c"]["p10"])
        if y is not None:
            env_points.append(f"{x},{y}")
    if env_points:
        svg.append(f'<polygon points="{" ".join(env_points)}" fill="#B2182B" opacity="0.2" />')

    line_points = []
    for i, m in enumerate(monthly_data):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        y = get_y_t(m["temperature_c"]["mean"])
        if y is not None:
            line_points.append(f"{x},{y}")
    if line_points:
        svg.append(f'<polyline points="{" ".join(line_points)}" fill="none" stroke="#B2182B" stroke-width="3" />')
        for point in line_points:
            x, y = point.split(",")
            svg.append(f'<circle cx="{x}" cy="{y}" r="4" fill="#B2182B" />')

    for i, m in enumerate(months):
        x = padding_left + (i + 0.5) * (graph_width / 12)
        svg.append(f'<text x="{x}" y="{padding_top+graph_height+20}" font-family="system-ui, sans-serif" font-size="12" fill="#24313A" text-anchor="middle">{m}</text>')

    t_ticks = 5
    for i in range(t_ticks + 1):
        val = min_t + i * (max_t - min_t) / t_ticks
        y = get_y_t(val)
        svg.append(f'<text x="{padding_left-10}" y="{y+4}" font-family="system-ui, sans-serif" font-size="12" fill="#B2182B" text-anchor="end">{int(val)}°C</text>')

    p_ticks = 5
    for i in range(p_ticks + 1):
        val = i * max_p / p_ticks
        y = get_y_p(val)
        svg.append(f'<text x="{width-padding_right+10}" y="{y+4}" font-family="system-ui, sans-serif" font-size="12" fill="#2166AC" text-anchor="start">{int(val)}mm</text>')

    svg.append('</svg>')
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
