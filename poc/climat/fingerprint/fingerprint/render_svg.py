"""Rendu SVG de l'empreinte climatique (spec §2, §13.1, §15, §16).

SVG écrit à la main : rendu identique web/PDF, coût navigateur minimal,
tooltips natifs via <title>, et accessibilité via role/aria-label.
"""
from __future__ import annotations

import html
from typing import Any

from .events import FAMILY_MARKER
from .model import Fingerprint, Row, YearCell
from .palettes import MISSING_STROKE, color_for, legend_swatches

# --- Géométrie ---------------------------------------------------------------
CELL_W, CELL_H, GAP = 26, 26, 2
LABEL_W = 150
DELTA_W = 190
EVENT_BAND_H = 92
TOP_PAD, BOTTOM_PAD, LEFT_PAD = 96, 130, 28
YEAR_AXIS_H = 34

FONT = "'Inter','Segoe UI',system-ui,sans-serif"
INK = "#1c1c1c"
MUTED = "#6b6b6b"
RULE = "#dedbd5"


def _esc(s: Any) -> str:
    return html.escape(str(s), quote=True)


def _fmt(v: float | None, unit: str, digits: int = 1) -> str:
    if v is None:
        return "n/d"
    if unit in ("jours", "mois"):
        return f"{v:.0f} {unit}"
    return f"{v:.{digits}f} {unit}"


def _signed(v: float | None, unit: str, digits: int = 1) -> str:
    if v is None:
        return "n/d"
    return f"{v:+.{digits}f} {unit}"


def _tooltip(row: Row, cell: YearCell, n_years: int) -> str:
    """Contenu du survol (spec §15)."""
    lines = [f"{cell.year} — {row.label}", ""]
    lines.append(f"Valeur           {_fmt(cell.value, row.unit)}")
    lines.append(f"Anomalie         {_signed(cell.anomaly, row.unit)}")
    if cell.percentile is not None:
        lines.append(f"Percentile réf.  P{cell.percentile:.0f}")
    label = cell.extra.get("class_label")
    if label:
        lines.append(f"Classe           {label}")
    if cell.rank:
        lines.append(f"Rang             {cell.rank} / {n_years}")
    for k, v in cell.extra.items():
        if k == "class_label":
            continue
        lines.append(f"{k:<16} {v}")
    lines += ["", f"{row.source} — grille {row.resolution}",
              "contexte climatique, pas une mesure à 100 m"]
    return "\n".join(lines)


def _marker(kind: str, x: float, y: float, r: float = 6.0) -> str:
    if kind == "circle":
        return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}"/>'
    if kind == "triangle":
        return (f'<polygon points="{x:.1f},{y - r:.1f} {x + r:.1f},{y + r * .8:.1f} '
                f'{x - r:.1f},{y + r * .8:.1f}"/>')
    if kind == "triangle-down":
        return (f'<polygon points="{x:.1f},{y + r:.1f} {x + r:.1f},{y - r * .8:.1f} '
                f'{x - r:.1f},{y - r * .8:.1f}"/>')
    if kind == "diamond":
        return (f'<polygon points="{x:.1f},{y - r:.1f} {x + r:.1f},{y:.1f} '
                f'{x:.1f},{y + r:.1f} {x - r:.1f},{y:.1f}"/>')
    if kind == "square":
        s = r * 0.9
        return f'<rect x="{x - s:.1f}" y="{y - s:.1f}" width="{2 * s:.1f}" height="{2 * s:.1f}"/>'
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}"/>'


def _delta_text(row: Row) -> str:
    d = row.decade_delta.get("delta")
    if d is None:
        return "n/d"
    if row.unit == "mm":
        pct = row.decade_delta.get("delta_pct")
        return f"{pct:+.0f} %" if pct is not None else f"{d:+.0f} mm"
    if row.unit in ("jours", "mois"):
        return f"{d:+.1f} {row.unit}/an"
    return f"{d:+.1f} {row.unit}"


def render_svg(fp: Fingerprint, title: str | None = None) -> str:
    years = fp.years
    n = len(years)
    rows = fp.rows
    grid_w = n * CELL_W + (n - 1) * GAP
    width = LEFT_PAD + LABEL_W + grid_w + 24 + DELTA_W + LEFT_PAD
    grid_x = LEFT_PAD + LABEL_W
    grid_y = TOP_PAD + EVENT_BAND_H + YEAR_AXIS_H
    grid_h = len(rows) * CELL_H + max(0, len(rows) - 1) * GAP
    height = grid_y + grid_h + BOTTOM_PAD

    p0, p1 = fp.tile.period
    r0, r1 = fp.tile.reference_period
    heading = title or "L'empreinte climatique du lieu"

    def col_x(i: int) -> float:
        return grid_x + i * (CELL_W + GAP)

    o: list[str] = []
    o.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="Empreinte climatique {p0}-{p1}, {len(rows)} indicateurs annuels">'
    )
    o.append(f'<style>text{{font-family:{FONT};fill:{INK}}}'
             f'.t{{font-size:22px;font-weight:600}}'
             f'.s{{font-size:12.5px;fill:{MUTED}}}'
             f'.rl{{font-size:13px;font-weight:500}}'
             f'.yr{{font-size:10px;fill:{MUTED}}}'
             f'.dl{{font-size:12px}}.dv{{font-size:12px;font-weight:600}}'
             f'.ev{{font-size:10px;fill:{MUTED}}}'
             f'.lg{{font-size:10.5px;fill:{MUTED}}}'
             f'rect.c{{shape-rendering:crispEdges}}</style>')
    o.append(f'<rect width="{width}" height="{height}" fill="#ffffff"/>')

    # --- En-tête ---
    o.append(f'<text class="t" x="{LEFT_PAD}" y="40">{_esc(heading)}</text>')
    o.append(f'<text class="s" x="{LEFT_PAD}" y="61">'
             f'Qu\'est-ce qui a changé en trente ans ? — dalle {_esc(fp.tile.tile_id)} '
             f'({fp.tile.lat:.4f}, {fp.tile.lon:.4f})</text>')
    o.append(f'<text class="s" x="{LEFT_PAD}" y="79">'
             f'Période représentée : {p0}–{p1} · Référence des anomalies : {r0}–{r1} · '
             f'Données de réanalyse sur grille</text>')

    # --- Bande des événements exceptionnels (§13.1) ---
    band_base = TOP_PAD + EVENT_BAND_H - 8
    o.append(f'<line x1="{grid_x}" y1="{band_base}" x2="{grid_x + grid_w}" y2="{band_base}" '
             f'stroke="{RULE}" stroke-width="1"/>')
    lanes = [0, 1, 0, 1, 0, 1, 0, 1]
    for k, ev in enumerate(fp.events):
        if not (p0 <= ev.year <= p1):
            continue
        i = ev.year - p0
        x = col_x(i) + CELL_W / 2
        lane = lanes[k % len(lanes)]
        my = TOP_PAD + 14 + lane * 26
        color = color_for(_family_palette(ev.family), "very_high")
        o.append(f'<g fill="{color}"><title>{_esc(ev.label)} — {_esc(ev.date_start)} → '
                 f'{_esc(ev.date_end)} (sévérité P{ev.severity_percentile:.1f})</title>'
                 f'{_marker(FAMILY_MARKER.get(ev.family, "circle"), x, my)}</g>')
        o.append(f'<line x1="{x:.1f}" y1="{my + 8:.1f}" x2="{x:.1f}" y2="{band_base:.1f}" '
                 f'stroke="{RULE}" stroke-width="1"/>')
        o.append(f'<text class="ev" x="{x:.1f}" y="{my - 10:.1f}" text-anchor="middle">'
                 f'{_esc(_short_family(ev.family))}</text>')
    if fp.events:
        o.append(f'<text class="s" x="{LEFT_PAD}" y="{TOP_PAD + 18}">Événements</text>')

    # --- Axe des années ---
    ay = grid_y - 10
    for i, y in enumerate(years):
        if y % 5 == 0 or i == 0 or i == n - 1:
            o.append(f'<text class="yr" x="{col_x(i) + CELL_W / 2:.1f}" y="{ay}" '
                     f'text-anchor="middle">{y}</text>')

    # --- Matrice ---
    for j, row in enumerate(rows):
        ry = grid_y + j * (CELL_H + GAP)
        o.append(f'<text class="rl" x="{grid_x - 12}" y="{ry + CELL_H / 2 + 4.5:.1f}" '
                 f'text-anchor="end">{_esc(row.label)}</text>')
        for i, cell in enumerate(row.years):
            fill = color_for(row.palette, cell.cls)
            stroke = f' stroke="{MISSING_STROKE}" stroke-dasharray="2 2"' if cell.cls is None else ''
            o.append(
                f'<rect class="c" x="{col_x(i):.1f}" y="{ry}" width="{CELL_W}" height="{CELL_H}" '
                f'fill="{fill}"{stroke}><title>{_esc(_tooltip(row, cell, n))}</title></rect>'
            )
        # Colonne de synthèse décennale (§16)
        dx = grid_x + grid_w + 24
        o.append(f'<text class="dv" x="{dx}" y="{ry + CELL_H / 2 + 4.5:.1f}">'
                 f'{_esc(_delta_text(row))}</text>')
        verdict = row.trend.get("verdict")
        if verdict:
            o.append(f'<text class="lg" x="{dx + 92}" y="{ry + CELL_H / 2 + 4:.1f}">'
                     f'{_esc(verdict)}</text>')

    dx = grid_x + grid_w + 24
    o.append(f'<text class="s" x="{dx}" y="{grid_y - 10}">'
             f'{p0}–{p0 + 9} → {p1 - 9}–{p1}</text>')

    # --- Légende qualitative ---
    ly = grid_y + grid_h + 34
    o.append(f'<text class="s" x="{LEFT_PAD}" y="{ly}">'
             f'Position de l\'année dans la distribution {r0}–{r1} de chaque indicateur</text>')
    lx = LEFT_PAD
    ly2 = ly + 14
    for row in rows:
        o.append(f'<text class="lg" x="{lx}" y="{ly2 + 10}">{_esc(row.label)}</text>')
        for k, (cls, col) in enumerate(legend_swatches(row.palette)):
            o.append(f'<rect x="{lx + 96 + k * 16}" y="{ly2}" width="14" height="12" '
                     f'fill="{col}"><title>{_esc(cls)}</title></rect>')
        ly2 += 17
    o.append(f'<text class="lg" x="{LEFT_PAD + 200}" y="{ly + 24}">'
             f'← très basse · basse · proche de la normale · haute · très haute →</text>')

    o.append('</svg>')
    return "\n".join(o)


def _family_palette(family: str) -> str:
    return {"heat": "utci", "heavy_rain": "extreme_rain", "drought": "drought",
            "wind": "wind", "cold": "temperature", "snow": "snow"}.get(family, "temperature")


def _short_family(family: str) -> str:
    return {"heat": "chaleur", "heavy_rain": "pluie", "drought": "sécher.",
            "wind": "vent", "cold": "froid", "snow": "neige"}.get(family, family)
