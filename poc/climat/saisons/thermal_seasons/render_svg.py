"""Rendu SVG des saisons thermiques — ajustements visuels V5.

Cette passe est STRICTEMENT visuelle : aucune logique scientifique ici. Toutes
les valeurs proviennent du document JSON produit par le pipeline.

Principes V5 :
- deux repères calendaires blancs (saisons fixes et mois) ;
- deux bandes thermiques pastel ;
- aucun texte ni connecteur entre les bandes thermiques ;
- frontières et incertitudes signalées par des pointillés verticaux discrets.
"""

from __future__ import annotations

from .noleap import NOLEAP_DAYS

# Palette V5 : quatre catégories saisonnières pastel. Les couleurs qualifient
# une saison, sans suggérer une intensité thermique.
SEASON_COLORS = {
    "winter": "#8DEBFF",   # bleu surligneur
    "spring": "#FF9FC7",   # rose surligneur
    "summer": "#C7F36B",   # vert surligneur
    "autumn": "#FFC45C",   # orange surligneur
}
SEASON_ORDER = ["winter", "spring", "summer", "autumn", "winter"]
SEASON_LABELS = ["HIVER", "PRINTEMPS", "ÉTÉ", "AUTOMNE", "HIVER"]

# Thème neutre (§5–§8).
BG_COLOR = "#C5C4C1"
SHADOW_COLOR = "#1C2529"
UNCERTAINTY_FILL = "#AEB7B3"
UNCERTAINTY_STROKE = "#69756F"
MEDIAN_COLOR = "#C83D3D"

# Dégradé de transition entre saisons : une zone blanche centrale, entourée de
# fondus colorés. Elle rend la date médiane lisible au sein de l'incertitude.
SEASON_OPACITY = "0.84"

# Transition (saison gauche -> saison droite) -> id de gradient.
TRANSITION_GRADIENT = {
    ("winter", "spring"): "grad-winter-spring",
    ("spring", "summer"): "grad-spring-summer",
    ("summer", "autumn"): "grad-summer-autumn",
    ("autumn", "winter"): "grad-autumn-winter",
}

WIDTH = 1000
LEFT = 80
PLOT_WIDTH = 720
REFERENCE_SEASONS_TOP = 118
REFERENCE_MONTHS_TOP = 166
EARLY_TOP = 214
LATE_TOP = 262
BAND_HEIGHT = 32
REFERENCE_BAND_HEIGHT = BAND_HEIGHT
SIG_X = LEFT + PLOT_WIDTH + 24
HEIGHT = 326

MONTHS = ["JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC"]
_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_DOY_START = [1]
for _l in _MONTH_LENGTHS:
    _DOY_START.append(_DOY_START[-1] + _l)


def _x(doy: float, left: float = LEFT, plot_width: float = PLOT_WIDTH) -> float:
    """Position x (px) d'un DOY, proportionnelle aux jours de l'année (§17)."""
    return left + (doy - 1) / (NOLEAP_DAYS - 1) * plot_width


def _medians(dec: dict | None) -> list[float] | None:
    """Médianes [spring, summer, autumn, winter] d'une décennie, ou None."""
    if not dec:
        return None
    keys = ["spring_start", "summer_start", "autumn_start", "winter_start"]
    meds = [dec.get(k, {}).get("median") for k in keys]
    if any(v is None for v in meds):
        return None
    return [float(v) for v in meds]


def render_thermal_seasons_svg(document: dict) -> str:
    decades = document["decades"]
    early = decades.get("1996-2005", {})
    late = decades.get("2016-2025", {})

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        'role="img" aria-labelledby="thermal-seasons-title thermal-seasons-desc">',
        '<title id="thermal-seasons-title">Les saisons thermiques se déplacent</title>',
        '<desc id="thermal-seasons-desc">Comparaison des saisons thermiques médianes de 1996–2005 '
        'et de 2016–2025. Les bandes montrent hiver, printemps, été et automne ; les zones autour '
        'des frontières représentent la dispersion interquartile des dates de transition.</desc>',
        '<defs>',
        '<filter id="soft-shadow" x="-5%" y="-5%" width="110%" height="120%">',
        f'<feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="{SHADOW_COLOR}" flood-opacity="0.20"/>',
        '</filter>',
        # Dégradés blanc au centre des zones d'incertitude.
        '<linearGradient id="grad-winter-spring" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["winter"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["spring"]}" stop-opacity="0.78"/></linearGradient>',
        '<linearGradient id="grad-spring-summer" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["spring"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["summer"]}" stop-opacity="0.78"/></linearGradient>',
        '<linearGradient id="grad-summer-autumn" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["summer"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["autumn"]}" stop-opacity="0.78"/></linearGradient>',
        '<linearGradient id="grad-autumn-winter" x1="0" y1="0" x2="1" y2="0">',
        f'<stop offset="0" stop-color="{SEASON_COLORS["autumn"]}" stop-opacity="0.78"/>'
        '<stop offset="0.5" stop-color="#FBFAF7" stop-opacity="0.98"/>'
        f'<stop offset="1" stop-color="{SEASON_COLORS["winter"]}" stop-opacity="0.78"/></linearGradient>',
        '</defs>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;fill:#24313A}'
        '.title{font-size:23px;font-weight:650}.meta{font-size:12px;fill:#52616A}'
        '.band-label{font-size:13px;font-weight:600}.month{font-size:9px;fill:#52616A}'
        '.season{font-size:11px;font-weight:600}'
        '.signature{font-size:15px;font-weight:650}.signature-sub{font-size:10px;fill:#52616A}</style>',
        # 1. fond gris neutre (§5) — désormais élément visuel majeur.
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{BG_COLOR}"/>',
        # Ombre légère portée sur les deux bandes de comparaison.
        f'<g filter="url(#soft-shadow)">'
        f'<rect x="{LEFT}" y="{EARLY_TOP}" width="{PLOT_WIDTH}" height="{BAND_HEIGHT}" fill="{SHADOW_COLOR}"/>'
        f'<rect x="{LEFT}" y="{LATE_TOP}" width="{PLOT_WIDTH}" '
        f'height="{BAND_HEIGHT}" fill="{SHADOW_COLOR}"/></g>',
    ]

    # Titre / méta (sur le fond gris, §10).
    parts.append('<text x="40" y="42" class="title">Les saisons se déplacent</text>')
    parts.append('<text x="40" y="66" class="meta">Le rythme thermique de l’année n’est plus le même.</text>')
    parts.append(f'<text x="40" y="92" class="meta">1996–2025 · référence 1991–2020 · seuils T25 / T75 locaux</text>')

    # Repères calendaires : saisons météorologiques fixes, puis mois. Les deux
    # bandes sont volontairement blanches : elles servent de référence, sans
    # concurrencer les deux comparaisons thermiques colorées.
    # Saisons astronomiques usuelles (année non bissextile) : printemps le 21
    # mars, été le 21 juin, automne le 23 septembre, hiver le 21 décembre.
    fixed_edges = [1, 80, 172, 266, 355, NOLEAP_DAYS]
    for seg in range(5):
        x0 = _x(fixed_edges[seg])
        x1 = _x(fixed_edges[seg + 1])
        parts.append(
            f'<rect x="{x0:.1f}" y="{REFERENCE_SEASONS_TOP}" width="{x1 - x0:.1f}" '
            f'height="{REFERENCE_BAND_HEIGHT}" fill="#FBFAF7"/>'
        )
        if seg < 4:
            parts.append(
                f'<text x="{(x0 + x1) / 2:.1f}" y="{REFERENCE_SEASONS_TOP + 20}" class="season" '
                f'text-anchor="middle">{SEASON_LABELS[seg]}</text>'
            )
    for doy in fixed_edges:
        x = _x(doy)
        parts.append(
            f'<line class="ts-reference-separator" x1="{x:.1f}" y1="{REFERENCE_SEASONS_TOP}" '
            f'x2="{x:.1f}" y2="{REFERENCE_SEASONS_TOP + REFERENCE_BAND_HEIGHT}" '
            'stroke="#52616A" stroke-width="0.8" stroke-dasharray="1 3" stroke-linecap="round" opacity="0.72"/>'
        )

    for i, label in enumerate(MONTHS):
        start = _DOY_START[i]
        end = min(_DOY_START[i + 1], NOLEAP_DAYS)
        x0 = _x(start)
        x1 = _x(end)
        parts.append(
            f'<rect x="{x0:.1f}" y="{REFERENCE_MONTHS_TOP}" width="{x1 - x0:.1f}" '
            f'height="{REFERENCE_BAND_HEIGHT}" fill="#FBFAF7"/>'
        )
        parts.append(
            f'<text x="{(x0 + x1) / 2:.1f}" y="{REFERENCE_MONTHS_TOP + 18}" class="month" '
            f'text-anchor="middle">{label}</text>'
        )
    for doy in [*_DOY_START[:-1], NOLEAP_DAYS]:
        x = _x(doy)
        parts.append(
            f'<line class="ts-month-separator" x1="{x:.1f}" y1="{REFERENCE_MONTHS_TOP}" '
            f'x2="{x:.1f}" y2="{REFERENCE_MONTHS_TOP + REFERENCE_BAND_HEIGHT}" '
            'stroke="#52616A" stroke-width="0.8" stroke-dasharray="1 3" stroke-linecap="round" opacity="0.58"/>'
        )

    # Les traits rouges centraux des deux décennies sont reliés pour rendre le
    # déplacement de chaque frontière immédiatement comparable.
    early_meds = _medians(early)
    late_meds = _medians(late)
    if early_meds and late_meds:
        for boundary, early_med, late_med in zip(
            ("spring", "summer", "autumn", "winter"), early_meds, late_meds, strict=True
        ):
            parts.append(
                f'<line class="ts-median-connector" data-boundary="{boundary}" '
                f'x1="{_x(early_med):.1f}" y1="{EARLY_TOP + BAND_HEIGHT + 4}" '
                f'x2="{_x(late_med):.1f}" y2="{LATE_TOP - 4}" stroke="{MEDIAN_COLOR}" '
                'stroke-width="1" stroke-dasharray="2 3" stroke-linecap="round" opacity="0.72"/>'
            )

    # Bandes : 1996–2005 (haut), 2016–2025 (bas).
    bands = [
        ("1996–2005", early, EARLY_TOP),
        ("2016–2025", late, LATE_TOP),
    ]
    for label, dec, y in bands:
        parts.append(
            f'<text x="{LEFT - 10}" y="{y + BAND_HEIGHT / 2 + 4}" class="band-label" text-anchor="end">{label}</text>'
        )
        meds = _medians(dec)
        if not dec or not meds:
            # Décennie non calculée : plaque neutre hachurée.
            parts.append(
                f'<rect x="{LEFT}" y="{y}" width="{PLOT_WIDTH}" height="{BAND_HEIGHT}" '
                'fill="#EDEDEA" stroke="#C5C4C1"/>'
            )
            continue
        edges = [1.0] + meds + [float(NOLEAP_DAYS)]
        # Segments de saison (sans vide, sans arrondi, §15).
        for seg in range(5):
            seg_start = edges[seg]
            seg_end = edges[seg + 1]
            color = SEASON_COLORS[SEASON_ORDER[seg]]
            x0 = _x(seg_start)
            x1 = _x(seg_end)
            parts.append(
                f'<rect x="{x0:.1f}" y="{y}" width="{x1 - x0:.1f}" height="{BAND_HEIGHT}" '
                f'fill="{color}" opacity="{SEASON_OPACITY}" rx="0" ry="0"/>'
            )
        # Zone P25–P75 grise : elle est bornée par deux pointillés. Le fondu
        # pastel -> blanc -> pastel, centré sur la médiane, matérialise la
        # transition sans transformer l'incertitude en frontière tranchée.
        boundaries = (
            dec.get("spring_start", {}),
            dec.get("summer_start", {}),
            dec.get("autumn_start", {}),
            dec.get("winter_start", {}),
        )
        for seg, b in enumerate(boundaries):
            med = b.get("median")
            p25 = b.get("p25")
            p75 = b.get("p75")
            if med is None or p25 is None or p75 is None:
                continue
            p25x = _x(p25)
            p75x = _x(p75)
            parts.append(
                f'<rect x="{p25x:.1f}" y="{y}" width="{p75x - p25x:.1f}" height="{BAND_HEIGHT}" '
                f'fill="{UNCERTAINTY_FILL}" opacity="0.36"/>'
            )
            gid = TRANSITION_GRADIENT[(SEASON_ORDER[seg], SEASON_ORDER[seg + 1])]
            parts.append(
                f'<rect x="{p25x:.1f}" y="{y}" width="{p75x - p25x:.1f}" '
                f'height="{BAND_HEIGHT}" fill="url(#{gid})"/>'
            )
            for edge_x in (p25x, p75x):
                parts.append(
                    f'<line class="ts-uncertainty-boundary" x1="{edge_x:.1f}" y1="{y}" '
                    f'x2="{edge_x:.1f}" y2="{y + BAND_HEIGHT}" stroke="{UNCERTAINTY_STROKE}" '
                    'stroke-width="0.8" stroke-dasharray="1 3" stroke-linecap="round" opacity="0.78"/>'
                )
            parts.append(
                f'<line class="ts-season-boundary" x1="{_x(med):.1f}" y1="{y - 4}" '
                f'x2="{_x(med):.1f}" y2="{y + BAND_HEIGHT + 4}" stroke="{MEDIAN_COLOR}" '
                'stroke-width="1" stroke-dasharray="1 3" stroke-linecap="round" opacity="0.9"/>'
            )
        # Labels de saison : les teintes pastel autorisent tous le même texte sombre.
        for seg in range(5):
            if seg == 4:
                continue
            seg_start = edges[seg]
            seg_end = edges[seg + 1]
            cx = (_x(seg_start) + _x(seg_end)) / 2
            parts.append(
                f'<text x="{cx:.1f}" y="{y + BAND_HEIGHT / 2 + 4}" class="season" '
                f'text-anchor="middle">{SEASON_LABELS[seg]}</text>'
            )

    # La signature récapitule l'information clé sans encombrer l'espace entre
    # les deux bandes de comparaison.
    comp = document.get("comparison", {})
    sig_y = EARLY_TOP + 17
    change = comp.get("summer_length_change_days")
    if change is not None:
        sign = "+" if change >= 0 else "−"
        parts.append(
            f'<text x="{SIG_X}" y="{sig_y}" class="signature">Été thermique</text>'
            f'<text x="{SIG_X}" y="{sig_y + 26}" class="signature" fill="{SEASON_COLORS["summer"]}">'
            f'{sign}{abs(change):.0f} jours</text>'
        )

    parts.append("</svg>")
    return "\n".join(parts)
