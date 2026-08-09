"""Rendu HTML d'aperçu + documentation (§22) + prévisualisation responsive (§13)."""

from __future__ import annotations

import html


def render_html(document: dict, svg: str) -> str:
    tile = document.get("tile", {})
    thresholds = document.get("thresholds", {})
    source = document.get("source", {})
    comp = document.get("comparison", {})
    t25 = thresholds.get("t25_c")
    t75 = thresholds.get("t75_c")
    change = comp.get("summer_length_change_days")

    summer_line = "indisponible"
    if change is not None:
        sign = "+" if change >= 0 else "−"
        summer_line = f"Été thermique {sign}{abs(change):.0f} jours"

    def fmt(v) -> str:
        return "—" if v is None else f"{v:.1f}"

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Les saisons se déplacent — {html.escape(str(tile.get('tile_id', '')))}</title>
<style>
  body {{ font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 0; background: #C5C4C1; color: #24313A; }}
  main {{ max-width: 1040px; margin: 0 auto; padding: 28px 20px 60px; }}
  h1 {{ font-size: 28px; margin: 0 0 4px; }}
  .lede {{ font-size: 16px; color: #52616A; margin: 0 0 24px; }}
  .signature {{ font-size: 20px; font-weight: 650; color: #B2182B; margin: 18px 0; }}
  .card {{ background: #FBFAF7; border: 1px solid #E4EBE7; border-radius: 8px; padding: 18px 20px; margin: 18px 0; }}
  .card h2 {{ font-size: 16px; margin: 0 0 10px; }}
  .card p {{ font-size: 14px; line-height: 1.55; color: #33424B; margin: 8px 0; }}
  svg {{ width: 100%; height: auto; display: block; }}
  table {{ border-collapse: collapse; font-size: 13px; }}
  td, th {{ border: 1px solid #E4EBE7; padding: 4px 8px; text-align: right; }}
  .muted {{ color: #6B7780; }}
</style>
</head>
<body>
<main>
  <h1>Les saisons se déplacent</h1>
  <p class="lede">Le rythme thermique de l’année n’est plus le même.</p>
  <div class="signature">{html.escape(summer_line)}</div>

  <div class="card">
    {svg}
  </div>

  <div class="card">
    <h2>Comment lire</h2>
    <p>Les saisons représentées ici sont thermiques, et non les saisons calendaires fixes. Les seuils froid et chaud sont propres au climat du lieu et sont calculés à partir des 25<sup>e</sup> et 75<sup>e</sup> percentiles du cycle thermique de référence 1991–2020.</p>
    <p>La ligne centrale de chaque transition représente la date médiane de la décennie ; la zone autour indique l’intervalle interquartile P25–P75, c’est-à-dire la variabilité d’une année à l’autre.</p>
  </div>

  <div class="card">
    <h2>Données</h2>
    <table>
      <tr><th>Élément</th><th>Valeur</th></tr>
      <tr><td>Source</td><td style="text-align:left">ERA5-Land</td></tr>
      <tr><td>Variable</td><td style="text-align:left">température de l’air à 2 m</td></tr>
      <tr><td>Référence</td><td style="text-align:left">1991–2020</td></tr>
      <tr><td>Période étudiée</td><td style="text-align:left">1996–2025</td></tr>
      <tr><td>Résolution</td><td style="text-align:left">grille 0,1° ; résolution native ~9 km</td></tr>
      <tr><td>T25 (°C)</td><td>{fmt(t25)}</td></tr>
      <tr><td>T75 (°C)</td><td>{fmt(t75)}</td></tr>
      <tr><td>Point de grille</td><td>{fmt(source.get('grid_lat'))}, {fmt(source.get('grid_lon'))}</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Limite spatiale</h2>
    <p>La dalle 3D localise le lieu ; les données climatiques proviennent d’une maille de réanalyse plus large et ne décrivent pas le climat à 100 m de résolution.</p>
  </div>
</main>
</body>
</html>"""


def render_responsive_html(svg: str) -> str:
    """Prévisualisation responsive (§13) : fond gris, aucune grande plaque blanche.

    Le SVG (viewBox responsive) est injecté directement sur le fond gris.
    """
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>preview</title>
<style>*{{margin:0;box-sizing:border-box}}body{{background:#C5C4C1;font-family:system-ui}}.frame{{margin:0 auto;max-width:1040px}}svg{{width:100%;height:auto;display:block}}</style></head>
<body><main><div class="frame" id="frame">{svg}</div></main></body></html>"""
