"""Preview HTML avec contexte, sources et représentativité explicites."""

from __future__ import annotations

import html


def _fmt(value: object, digits: int = 2) -> str:
    return "—" if value is None else f"{float(value):.{digits}f}".replace(".", ",")


def render_html(document: dict, svg: str) -> str:
    rep = document.get("representativity", {})
    source = document.get("sources", {})
    tile = document.get("tile", {})
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>L’eau au fil de l’année — {html.escape(str(tile.get('tile_id') or 'lieu'))}</title>
<style>body{{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#C5C4C1;color:#24313A}}main{{max-width:1140px;margin:auto;padding:28px 20px 60px}}h1{{font-size:28px;margin:0 0 4px}}.lede{{color:#52616A;margin:0 0 22px}}.card{{background:#FBFAF7;border:1px solid #E4E1DC;padding:18px 20px;margin:18px 0}}h2{{font-size:16px;margin:0 0 8px}}p,li{{font-size:14px;line-height:1.55;color:#33424B}}svg{{display:block;width:100%;height:auto}}table{{border-collapse:collapse;font-size:13px}}td,th{{border:1px solid #E4E1DC;padding:5px 8px;text-align:left}}</style></head>
<body><main><h1>L’eau au fil de l’année</h1><p class="lede">La pluie n’est qu’une partie de l’histoire.</p>
<div class="card">{svg}</div>
<div class="card"><h2>Comment lire</h2><p>Les barres bleues montrent les précipitations mensuelles. La bande centrale représente le <strong>stock d’eau modélisé dans les 0–100 cm</strong>. Les petites barres ocre montrent l’évapotranspiration réelle, c’est-à-dire l’eau qui repart vers l’atmosphère. La bande fine SPEI-3 résume des conditions relativement humides (bleu), proches de la référence (clair) ou sèches (brun).</p><p>Chaque détail mensuel est disponible au survol dans le SVG ; les valeurs sont des médianes décennales et les intervalles P25–P75 restent dans le JSON.</p></div>
<div class="card"><h2>Ce que représentent les données</h2><p>Les données décrivent une maille de réanalyse climatique et non une mesure directe effectuée sur le terrain. Le stock dérivé n’est ni une réserve utile réelle, ni une mesure de l’eau disponible dans une parcelle. Le ruissellement éventuel ne représente pas le débit d’un cours d’eau, et P − ET ne représente pas une recharge de nappe.</p>
<table><tr><th>Lieu demandé</th><td>{_fmt(tile.get('lat'), 4)}, {_fmt(tile.get('lon'), 4)}</td></tr><tr><th>Point de grille</th><td>{_fmt(rep.get('grid_lat'), 4)}, {_fmt(rep.get('grid_lon'), 4)}</td></tr><tr><th>Résolution</th><td>{_fmt(rep.get('grid_resolution_deg'), 2)}° ; native ~{_fmt(rep.get('native_resolution_km'), 0)} km</td></tr><tr><th>Altitude lieu / modèle / écart</th><td>{_fmt(rep.get('site_altitude_m'), 0)} m / {_fmt(rep.get('model_orography_m'), 0)} m / {_fmt(rep.get('altitude_difference_m'), 0)} m</td></tr></table></div>
<div class="card"><h2>Sources et références</h2><p>ERA5-Land pour les précipitations, le stock de sol modélisé et l’évapotranspiration réelle ; ERA5-Drought pour SPEI-3. Référence mensuelle 1991–2020 ; période étudiée 1996–2025 ; comparaison principale 1996–2005 / 2016–2025. Version : {html.escape(str(source.get('dataset_version') or 'non renseignée'))}. Récupération : {html.escape(str(source.get('retrieved_at') or 'non renseignée'))}.</p></div>
</main></body></html>"""
