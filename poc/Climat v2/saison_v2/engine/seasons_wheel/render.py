"""Rendu SVG de la roue des saisons. Passe strictement visuelle : aucune logique
scientifique ici, toutes les valeurs proviennent du document JSON V4 et de la
configuration visuelle. Écriture SVG par f-strings, zéro dépendance de rendu."""

from __future__ import annotations

import math
import re
from typing import Any

from . import geometry
from .config import WheelConfig

SEASON_LABELS_FR = {
    "winter": "Hiver",
    "spring": "Printemps",
    "summer": "Été",
    "autumn": "Automne",
}

# Saison colorée (été/hiver) à laquelle chaque limite est adjacente : spring_start et
# winter_start bordent l'hiver, summer_start et autumn_start bordent l'été. Sert à
# peindre chaque zone de décalage de la même couleur que la saison qu'elle touche.
BOUNDARY_SHIFT_SEASON = {
    "spring_start": "winter",
    "summer_start": "summer",
    "autumn_start": "summer",
    "winter_start": "winter",
}


def build_document(result: dict[str, Any]) -> dict[str, Any]:
    """Prépare un document de rendu plat depuis le ClimateResult V4 complet.

    Ne recalcule rien : lit uniquement des valeurs déjà présentes dans le JSON.
    """

    data = result["data"]
    early_key, late_key = "1996-2005", "2016-2025"
    coordinates = result["location"]["requested"]["geometry"]["coordinates"]
    location_text = (
        f"GPS {coordinates[1]:.4f}° N · {coordinates[0]:.4f}° E\n"
        f"Grille ERA5-Land : {data['source']['grid_lat']:.1f}° N · {data['source']['grid_lon']:.1f}° E"
    ).replace(".", ",")
    return {
        "location_title": "Val d'Aigoual",
        "location_text": location_text,
        "reference": data["thresholds"]["reference_period"].replace("-", "–"),
        "source": "Copernicus · ERA5-Land",
        "t25": data["thresholds"]["t25_c"],
        "t75": data["thresholds"]["t75_c"],
        "bootstrap_replicates": data["method"]["bootstrap_replicates"],
        "early_period": early_key,
        "late_period": late_key,
        "early_label": early_key.replace("-", "–"),
        "late_label": late_key.replace("-", "–"),
        "decades": {
            early_key: dict(data["decades"][early_key]["canonical_boundaries"]),
            late_key: dict(data["decades"][late_key]["canonical_boundaries"]),
        },
    }


def _n(value: float, decimals: int = 2) -> str:
    return f"{value:.{decimals}f}"


def _format_days(value: float) -> str:
    sign = "−" if value < 0 else "+"
    return f"{sign}{_n(abs(value), 1).replace('.', ',')}"


def _quadrant(angle_deg: float) -> str:
    a = angle_deg % 360.0
    if 45.0 <= a < 135.0:
        return "right"
    if 135.0 <= a < 225.0:
        return "bottom"
    if 225.0 <= a < 315.0:
        return "left"
    return "top"


def _text_anchor(quadrant: str) -> str:
    return {"right": "start", "left": "end", "top": "middle", "bottom": "middle"}[quadrant]


def _radial_line(cx: float, cy: float, angle_deg: float, r1: float, r2: float, extra: str = "", **attrs: str) -> str:
    x1, y1 = geometry.polar_point(cx, cy, r1, angle_deg)
    x2, y2 = geometry.polar_point(cx, cy, r2, angle_deg)
    attr_str = " ".join(f'{key.replace("_", "-")}="{value}"' for key, value in attrs.items())
    tail = f" {extra}" if extra else ""
    return f'<line x1="{_n(x1)}" y1="{_n(y1)}" x2="{_n(x2)}" y2="{_n(y2)}" {attr_str}{tail} />'


def _radial_leaf(
    cx: float, cy: float, angle_deg: float, r1: float, r2: float, half_width: float, fill: str, extra: str = ""
) -> str:
    """Aiguille feuille : pointue en ``r1`` et ``r2``, renflée à ``half_width`` en son
    milieu — deux courbes quadratiques symétriques de part et d'autre de l'axe radial."""

    p1 = geometry.polar_point(cx, cy, r1, angle_deg)
    p2 = geometry.polar_point(cx, cy, r2, angle_deg)
    mid = ((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)
    nx, ny = geometry.tangent_vector(angle_deg)  # perpendiculaire à l'axe radial
    k = 2.0 * half_width  # le point milieu d'une bézier quadratique n'atteint que la moitié de l'écart au point de contrôle
    c_top = (mid[0] + nx * k, mid[1] + ny * k)
    c_bottom = (mid[0] - nx * k, mid[1] - ny * k)
    d = (
        f"M {_n(p1[0])} {_n(p1[1])} "
        f"Q {_n(c_top[0])} {_n(c_top[1])} {_n(p2[0])} {_n(p2[1])} "
        f"Q {_n(c_bottom[0])} {_n(c_bottom[1])} {_n(p1[0])} {_n(p1[1])} Z"
    )
    tail = f" {extra}" if extra else ""
    return f'<path d="{d}" fill="{fill}"{tail} />'


def _arrow_head(tip: tuple[float, float], angle_deg: float, clockwise: bool, size: float, fill: str) -> str:
    tx, ty = geometry.tangent_vector(angle_deg, clockwise)
    back = (tip[0] - tx * size * 1.6, tip[1] - ty * size * 1.6)
    px, py = -ty, tx
    left = (back[0] + px * size * 0.55, back[1] + py * size * 0.55)
    right = (back[0] - px * size * 0.55, back[1] - py * size * 0.55)
    points = f"{_n(tip[0])},{_n(tip[1])} {_n(left[0])},{_n(left[1])} {_n(right[0])},{_n(right[1])}"
    return f'<polygon points="{points}" fill="{fill}" />'


def _timing(config: WheelConfig) -> tuple[float, float, float, float, float]:
    total = 2 * config.hold_seconds + 2 * config.transition_seconds
    p1 = config.hold_seconds / total * 100.0
    p2 = (config.hold_seconds + config.transition_seconds) / total * 100.0
    p3 = (2 * config.hold_seconds + config.transition_seconds) / total * 100.0
    return total, p1, p2, p3, 100.0


def _season_ring(
    cx: float,
    cy: float,
    config: WheelConfig,
    early_spans: list[geometry.SeasonSpan],
    late_spans: list[geometry.SeasonSpan],
    id_prefix: str,
) -> list[str]:
    """Deux anneaux concentriques statiques dans l'espace des saisons — l'ancienne
    décennie à l'intérieur, la récente à l'extérieur — au lieu d'un unique anneau animé
    en va-et-vient : les deux décennies restent visibles en même temps, plus besoin
    d'attendre l'animation pour les comparer. Chaque couche est entourée d'un cercle
    pointillé (pas de cercle intermédiaire plein)."""

    elements: list[str] = []
    split = config.season_ring_split_radius
    bands = ((config.season_inner, split, early_spans), (split, config.season_outer, late_spans))
    for inner, outer, spans in bands:
        radius = (inner + outer) / 2.0
        band_width = outer - inner
        for span in spans:
            name = span.name
            if name in ("spring", "autumn") and not config.fill_spring_autumn:
                continue
            color = f"url(#{id_prefix}-season-{name})" if name in ("summer", "winter") else getattr(config, name)
            dash, offset = geometry.arc_dash(radius, span.start_angle, span.sweep_deg)
            elements.append(
                f'<circle class="season-arc" cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(radius)}" fill="none" '
                f'stroke="{color}" stroke-width="{_n(band_width)}" stroke-dasharray="{dash}" '
                f'stroke-dashoffset="{_n(offset, 3)}" transform="rotate(-90 {_n(cx)} {_n(cy)})" />'
            )
    for radius in (config.season_inner, split, config.season_outer):
        elements.append(
            f'<circle cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(radius)}" fill="none" '
            f'stroke="{config.season_ring_outline_color}" stroke-width="{_n(config.season_ring_outline_width)}" '
            f'stroke-dasharray="{config.season_ring_outline_dash}" />'
        )
    return elements


def _active_markers(
    cx: float,
    cy: float,
    config: WheelConfig,
    early: dict[str, float],
    late: dict[str, float],
    animate: bool,
    id_prefix: str,
) -> tuple[list[str], list[str]]:
    elements: list[str] = []
    keyframes: list[str] = []
    total, p1, p2, p3, p4 = _timing(config)
    # Mord légèrement sur le disque central plutôt que de s'arrêter pile à son bord.
    r1 = config.hub_radius * (1.0 - config.active_marker_hub_overlap_pct)
    # La pointe extérieure recule d'un pourcentage de la longueur totale ; le côté moyeu ne bouge pas.
    r2 = r1 + (config.arrow_arc_radius - r1) * (1.0 - config.active_marker_tip_shrink_pct)
    half_width = config.active_width * config.active_leaf_width_factor / 2.0
    for key in geometry.BOUNDARY_KEYS:
        late_angle = geometry.angle_from_doy(late[key], config.top_doy, config.year_days, config.clockwise)
        extra = ""
        if animate:
            early_angle = geometry.angle_from_doy(early[key], config.top_doy, config.year_days, config.clockwise)
            unwrapped_early = geometry.unwrap_towards(late_angle, early_angle)
            anim_name = f"{id_prefix}-active-{key}"
            extra = (
                f'class="wheel-animated" transform-box="view-box" '
                f'transform-origin="{_n(cx)}px {_n(cy)}px" '
                f'style="animation: {anim_name} {_n(total, 3)}s {config.easing} infinite;"'
            )
            keyframes.append(
                f"@keyframes {anim_name} {{\n"
                f"  0%, {_n(p1, 4)}%, 100% {{ transform: rotate(0deg); }}\n"
                f"  {_n(p2, 4)}%, {_n(p3, 4)}% {{ transform: rotate({_n(unwrapped_early - late_angle, 3)}deg); }}\n"
                f"}}"
            )
        elements.append(_radial_leaf(cx, cy, late_angle, r1, r2, half_width, fill=config.active_color, extra=extra))
    return elements, keyframes


def _month_ring(cx: float, cy: float, config: WheelConfig) -> list[str]:
    elements: list[str] = [
        f'<circle cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(config.month_ring_outer)}" fill="none" '
        f'stroke="{config.muted}" stroke-width="{_n(config.month_ring_circle_width)}" />',
        f'<circle cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(config.month_ring_inner)}" fill="none" '
        f'stroke="{config.muted}" stroke-width="{_n(config.month_ring_circle_width)}" />',
    ]
    for month_index in range(12):
        start_day = geometry.CUMULATIVE_MONTH_DAYS[month_index] + 1
        end_day = geometry.CUMULATIVE_MONTH_DAYS[month_index + 1]
        for day in range(start_day, end_day + 1, config.tick_minor_step_days):
            angle = geometry.angle_from_doy(day, config.top_doy, config.year_days, config.clockwise)
            major = day == start_day
            length = config.tick_month_length if major else config.tick_minor_length
            elements.append(
                _radial_line(
                    cx, cy, angle, config.month_ring_outer, config.month_ring_outer + length,
                    stroke=config.ink if major else config.muted,
                    stroke_width=_n(config.tick_width * (1.8 if major else 1.1)),
                )
            )
        if config.show_month_names:
            mid_day = (start_day + end_day) / 2.0
            angle = geometry.angle_from_doy(mid_day, config.top_doy, config.year_days, config.clockwise)
            x, y = geometry.polar_point(cx, cy, (config.month_ring_inner + config.month_ring_outer) / 2.0, angle)
            # Tourné radialement, comme les index d'une montre (chaque lettre suit la
            # tangente du cercle à sa position plutôt que de rester à plat).
            elements.append(
                f'<text x="{_n(x)}" y="{_n(y)}" text-anchor="middle" dominant-baseline="middle" '
                f'transform="rotate({_n(angle)} {_n(x)} {_n(y)})" '
                f'font-family="{config.font_family}" font-size="{_n(config.month_size)}" font-weight="800" '
                f'fill="{config.ink}">{geometry.MONTHS_FR_INITIAL[month_index]}</text>'
            )
    return elements


def _fixed_boundary_ticks(cx: float, cy: float, config: WheelConfig, early: dict, late: dict) -> list[str]:
    """8 limites fixes, toujours en pointillés, dans la couleur PLEINE de la saison
    adjacente (bleu ou rouge, jamais la teinte pâle du dégradé qui rendrait le pointillé
    quasi blanc) ; seule l'opacité distingue la décennie ancienne de la récente.

    Chaque pointillé traverse tout le rayon (du disque central jusqu'au-delà du bord
    extérieur) : s'arrêter au cercle de partage des deux couches les faisait finir ou
    commencer dans le vide, sans rien à quoi s'accrocher visuellement."""

    elements: list[str] = []
    r1 = max(config.hub_radius, config.season_inner - config.early_extend)
    r1_early = r1
    r2_early = config.season_outer + config.early_extend
    r1_late = r1
    r2_late = config.season_outer + config.late_extend
    early_dash_attr = "" if config.early_dash in ("", "none") else f'stroke-dasharray="{config.early_dash}"'
    late_dash_attr = "" if config.late_dash in ("", "none") else f'stroke-dasharray="{config.late_dash}"'
    for key in geometry.BOUNDARY_KEYS:
        season_name = BOUNDARY_SHIFT_SEASON[key]
        color = getattr(config, f"{season_name}_gradient_start")  # couleur pleine, jamais la teinte pâle
        early_angle = geometry.angle_from_doy(early[key], config.top_doy, config.year_days, config.clockwise)
        late_angle = geometry.angle_from_doy(late[key], config.top_doy, config.year_days, config.clockwise)
        elements.append(
            _radial_line(
                cx, cy, early_angle, r1_early, r2_early, extra=early_dash_attr,
                stroke=color, stroke_width=_n(config.early_width), stroke_opacity=_n(config.early_tick_opacity, 2),
            )
        )
        elements.append(
            _radial_line(
                cx, cy, late_angle, r1_late, r2_late, extra=late_dash_attr,
                stroke=color, stroke_width=_n(config.late_width), stroke_opacity=_n(config.late_tick_opacity, 2),
            )
        )
    return elements


def _arrow_circle(cx: float, cy: float, config: WheelConfig) -> list[str]:
    """Matérialise le cercle sur lequel courent les flèches de décalage et les dates."""

    if not config.show_arrow_circle:
        return []
    return [
        f'<circle cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(config.arrow_arc_radius)}" fill="none" '
        f'stroke="{config.arrow_circle_color}" stroke-width="{_n(config.arrow_circle_width)}" />'
    ]


def _shift_arrows(cx: float, cy: float, config: WheelConfig, shifts: list[geometry.ShiftSpan]) -> list[str]:
    """Trace uniquement les flèches (arc + pointe) sur le cercle matérialisé ; le texte
    associé est posé séparément par :func:`_combined_boundary_labels`."""

    elements: list[str] = []
    radius = config.arrow_arc_radius
    for shift in shifts:
        early_point = geometry.polar_point(cx, cy, radius, shift.early_angle)
        late_point = geometry.polar_point(cx, cy, radius, shift.late_angle)
        large_arc = 1 if shift.sweep_deg > 180 else 0
        sweep_flag = 1 if shift.clockwise_sweep else 0
        elements.append(
            f'<path d="M {_n(early_point[0])} {_n(early_point[1])} '
            f'A {_n(radius)} {_n(radius)} 0 {large_arc} {sweep_flag} {_n(late_point[0])} {_n(late_point[1])}" '
            f'fill="none" stroke="{config.arrow_color}" stroke-width="{_n(config.arrow_width)}" '
            f'stroke-linecap="round" />'
        )
        elements.append(_arrow_head(late_point, shift.late_angle, shift.clockwise_sweep, config.arrow_head_size, config.arrow_color))
    return elements


def _em_value(css_value: str) -> float:
    if css_value.endswith("em"):
        try:
            return float(css_value[:-2])
        except ValueError:
            return 0.0
    return 0.0


def _estimate_text_width(text: str, font_size: float, letter_spacing_em: float, char_width_factor: float) -> float:
    """Estimation grossière de la largeur d'un texte, en px (aucune mesure réelle de
    police disponible ici — zéro dépendance de rendu, cf. l'en-tête du module)."""

    count = len(text)
    if count == 0:
        return 0.0
    char_width = char_width_factor * font_size
    spacing = letter_spacing_em * font_size
    return count * char_width + max(0, count - 1) * spacing


def _arc_badge(
    cx: float, cy: float, radius: float, center_angle: float, half_span_deg: float, width: float,
    fill: str, stroke: str = "none", stroke_width: float = 0.0,
) -> str:
    """Cartouche derrière la valeur du décalage : un secteur de couronne (trapèze
    circulaire) — deux arcs concentriques reliés par deux côtés radiaux droits — pas un
    simple arc épais à bouts ronds. Posé avant le texte dans l'ordre de dessin pour
    rester dessous."""

    r_out, r_in = radius + width / 2.0, radius - width / 2.0
    start_angle, end_angle = center_angle - half_span_deg, center_angle + half_span_deg
    large_arc = 1 if (end_angle - start_angle) > 180.0 else 0
    outer_start = geometry.polar_point(cx, cy, r_out, start_angle)
    outer_end = geometry.polar_point(cx, cy, r_out, end_angle)
    inner_end = geometry.polar_point(cx, cy, r_in, end_angle)
    inner_start = geometry.polar_point(cx, cy, r_in, start_angle)
    d = (
        f"M {_n(outer_start[0])} {_n(outer_start[1])} "
        f"A {_n(r_out)} {_n(r_out)} 0 {large_arc} 1 {_n(outer_end[0])} {_n(outer_end[1])} "
        f"L {_n(inner_end[0])} {_n(inner_end[1])} "
        f"A {_n(r_in)} {_n(r_in)} 0 {large_arc} 0 {_n(inner_start[0])} {_n(inner_start[1])} Z"
    )
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{_n(stroke_width)}" />'


def _curved_label_path(
    cx: float, cy: float, radius: float, center_angle: float, half_span_deg: float, path_id: str
) -> str:
    """Arc invisible pour poser du texte via <textPath>. Toujours parcouru dans le même
    sens horaire (pas d'inversion haut/bas) : le retournement en bas de cercle plaçait le
    texte du mauvais côté du tracé et le faisait mordre sur l'anneau intérieur."""

    start_angle, end_angle, sweep_flag = center_angle - half_span_deg, center_angle + half_span_deg, 1
    start = geometry.polar_point(cx, cy, radius, start_angle)
    end = geometry.polar_point(cx, cy, radius, end_angle)
    return (
        f'<path id="{path_id}" d="M {_n(start[0])} {_n(start[1])} '
        f'A {_n(radius)} {_n(radius)} 0 0 {sweep_flag} {_n(end[0])} {_n(end[1])}" fill="none" stroke="none" />'
    )


def _combined_boundary_labels(
    cx: float,
    cy: float,
    config: WheelConfig,
    shifts: list[geometry.ShiftSpan],
    id_prefix: str,
) -> list[str]:
    """Une seule étiquette courbe par frontière, posée sur le cercle des flèches :
    « 13 sept. +9,3 j 22 sept. » — date ancienne, décalage, date récente, dans un seul
    <text> (plusieurs <tspan> colorés) centré sur l'angle médian de la flèche."""

    paths: list[str] = []
    badges: list[str] = []
    elements: list[str] = []
    radius = config.arrow_arc_radius + config.combined_label_offset
    for index, shift in enumerate(shifts):
        mid_angle = shift.early_angle + geometry.normalize_delta(shift.late_angle - shift.early_angle) / 2.0
        path_id = f"{id_prefix}-label-path-{index}"
        paths.append(_curved_label_path(cx, cy, radius, mid_angle, config.combined_label_half_span_deg, path_id))

        early_text = geometry.format_date(shift.early_doy, config.date_rounding)
        late_text = geometry.format_date(shift.late_doy, config.date_rounding)
        shift_text = f" {_format_days(shift.shift_days)} " if config.show_shift_values else " "

        if config.combined_label_badge_enabled:
            factor = config.combined_label_badge_char_width_factor
            # Le cartouche englobe toute l'étiquette (dates + décalage), pas seulement le
            # nombre de jours : largeur = somme des trois segments, chacun à sa propre taille.
            text_width = (
                _estimate_text_width(early_text, config.date_size, 0.0, factor)
                + _estimate_text_width(shift_text, config.shift_size, _em_value(config.shift_value_letter_spacing), factor)
                + _estimate_text_width(late_text, config.date_size, 0.0, factor)
            )
            badge_half_span_deg = math.degrees(
                (text_width + 2.0 * config.combined_label_badge_horizontal_padding) / (2.0 * radius)
            )
            badges.append(
                _arc_badge(
                    cx, cy, radius, mid_angle, badge_half_span_deg,
                    config.shift_size * config.combined_label_badge_padding, config.combined_label_badge_color,
                    stroke=config.combined_label_badge_stroke_color, stroke_width=config.combined_label_badge_stroke_width,
                )
            )

        spans = [
            f'<tspan font-size="{_n(config.date_size)}" font-weight="700" '
            f'fill="{config.date_color_early}">{early_text}</tspan>'
        ]
        if config.show_shift_values:
            spans.append(
                f'<tspan font-size="{_n(config.shift_size)}" font-weight="800" '
                f'letter-spacing="{config.shift_value_letter_spacing}" '
                f'fill="{config.arrow_color}"> {_format_days(shift.shift_days)} </tspan>'
            )
        else:
            spans.append('<tspan> </tspan>')
        spans.append(
            f'<tspan font-size="{_n(config.date_size)}" font-weight="700" '
            f'fill="{config.date_color_late}">{late_text}</tspan>'
        )
        elements.append(
            f'<text text-anchor="middle" dominant-baseline="central" font-family="{config.font_family}">'
            f'<textPath href="#{path_id}" startOffset="50%">{"".join(spans)}</textPath></text>'
        )
    return paths + badges + elements


def _season_name_labels(
    cx: float,
    cy: float,
    config: WheelConfig,
    early_spans: list[geometry.SeasonSpan],
    late_spans: list[geometry.SeasonSpan],
    id_prefix: str,
) -> list[str]:
    """Noms de saison en texte courbe, chaque lettre suivant la tangente du cercle (pas
    un bloc rigide tourné en bloc) — comme une inscription curviligne sur le cadran d'une
    montre. Sous été et hiver, une seconde ligne courbe donne l'évolution de la durée de
    la saison entre les deux décennies (+/- x jours)."""

    if not config.show_season_names:
        return []
    early_by_name = {span.name: span for span in early_spans}
    paths: list[str] = []
    elements: list[str] = []
    for span in late_spans:
        mid_angle = span.start_angle + span.sweep_deg / 2.0
        if config.season_name_lock_to_cardinal:
            mid_angle = round(mid_angle / 90.0) * 90.0 % 360.0
        path_id = f"{id_prefix}-season-name-path-{span.name}"
        paths.append(
            _curved_label_path(cx, cy, config.season_name_radius, mid_angle, config.season_name_curve_half_span_deg, path_id)
        )
        elements.append(
            f'<text text-anchor="middle" dominant-baseline="central" font-family="{config.season_name_font_family}" '
            f'font-size="{_n(config.season_size)}" font-weight="{config.season_name_font_weight}" '
            f'letter-spacing="{config.season_name_letter_spacing}" fill="{config.ink}">'
            f'<textPath href="#{path_id}" startOffset="50%">{SEASON_LABELS_FR[span.name]}</textPath></text>'
        )
        if span.name in ("summer", "winter"):
            delta = span.duration_days - early_by_name[span.name].duration_days
            sign = "+" if delta >= 0 else "−"
            delta_text = f"{sign}{_n(abs(delta), 1).replace('.', ',')} j"
            delta_radius = config.season_name_radius - config.season_duration_delta_offset
            delta_path_id = f"{id_prefix}-season-delta-path-{span.name}"
            paths.append(
                _curved_label_path(cx, cy, delta_radius, mid_angle, config.season_name_curve_half_span_deg, delta_path_id)
            )
            elements.append(
                f'<text text-anchor="middle" dominant-baseline="central" font-family="{config.season_name_font_family}" '
                f'font-size="{_n(config.season_duration_delta_size)}" font-weight="{config.season_name_font_weight}" '
                f'fill="{config.ink}">'
                f'<textPath href="#{delta_path_id}" startOffset="50%">{delta_text}</textPath></text>'
            )
    return paths + elements


def _caption(cx: float, config: WheelConfig, document: dict) -> list[str]:
    if not config.show_caption:
        return []
    x = config.margin
    title = document.get("location_title", "")
    title_size = config.caption_size * 1.8
    title_height = title_size * 1.3 if title else 0.0
    lines = [
        *document["location_text"].split("\n"),
        f"Comparaison {document['early_label']} → {document['late_label']} · saisons thermiques",
        f"T25 {_n(document['t25'], 3).replace('.', ',')} °C · T75 {_n(document['t75'], 3).replace('.', ',')} °C "
        f"· référence {document['reference']} · {document['source']}",
        "Graphisme : alex@ndrecasta.net · d'après https://doi.org/10.1029/2020GL091753",
    ]
    line_height = config.caption_size * 1.5
    y = config.height - config.margin - title_height - len(lines) * line_height
    elements = []
    if title:
        elements.append(
            f'<text x="{_n(x)}" y="{_n(y)}" font-family="{config.font_family}" font-size="{_n(title_size)}" '
            f'font-weight="800" fill="{config.ink}">{title}</text>'
        )
    for index, line in enumerate(lines):
        weight = "700" if index < 2 else "500"
        color = config.ink if index < 2 else config.muted
        size = config.caption_size if index < 3 else config.caption_size * 0.86
        elements.append(
            f'<text x="{_n(x)}" y="{_n(y + title_height + index * line_height)}" '
            f'font-family="{config.font_family}" font-size="{_n(size)}" font-weight="{weight}" '
            f'fill="{color}">{line}</text>'
        )
    return elements


def _debug_guides(cx: float, cy: float, config: WheelConfig) -> list[str]:
    if not config.debug_guides:
        return []
    elements: list[str] = []
    outer = config.arrow_arc_radius
    radii = [
        config.hub_radius, config.season_inner, config.season_outer, config.season_name_radius,
        config.month_ring_inner, config.month_ring_outer, config.arrow_arc_radius,
    ]
    for radius in radii:
        elements.append(
            f'<circle cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(radius)}" fill="none" stroke="#ff00ff" '
            f'stroke-width="0.75" stroke-dasharray="3 3" opacity="0.5" />'
        )
    for deg in range(0, 360, 30):
        x, y = geometry.polar_point(cx, cy, outer + 20, float(deg))
        elements.append(
            _radial_line(cx, cy, float(deg), config.hub_radius, outer, stroke="#ff00ff", stroke_width="0.5", opacity="0.4")
        )
        elements.append(
            f'<text x="{_n(x)}" y="{_n(y)}" text-anchor="middle" font-size="10" fill="#ff00ff">{deg}°</text>'
        )
    return elements


def _defs(cx: float, cy: float, config: WheelConfig, id_prefix: str) -> str:
    season_edge = _n(config.season_inner / config.season_outer, 4)
    return (
        "<defs>"
        f'<radialGradient id="{id_prefix}-season-summer" gradientUnits="userSpaceOnUse" cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(config.season_outer)}">'
        f'<stop offset="{season_edge}" stop-color="{config.summer_gradient_start}" />'
        f'<stop offset="1" stop-color="{config.summer_gradient_end}" />'
        "</radialGradient>"
        f'<radialGradient id="{id_prefix}-season-winter" gradientUnits="userSpaceOnUse" cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(config.season_outer)}">'
        f'<stop offset="{season_edge}" stop-color="{config.winter_gradient_start}" />'
        f'<stop offset="1" stop-color="{config.winter_gradient_end}" />'
        "</radialGradient>"
        f'<pattern id="{id_prefix}-hatch-summer" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">'
        f'<rect width="6" height="6" fill="{config.summer}" fill-opacity="0.12" />'
        f'<line x1="0" y1="0" x2="0" y2="6" stroke="{config.summer}" stroke-width="2.4" />'
        "</pattern>"
        f'<pattern id="{id_prefix}-hatch-winter" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">'
        f'<rect width="6" height="6" fill="{config.winter}" fill-opacity="0.12" />'
        f'<line x1="0" y1="0" x2="0" y2="6" stroke="{config.winter}" stroke-width="2.4" />'
        "</pattern>"
        "</defs>"
    )


def render_wheel_svg(document: dict[str, Any], config: WheelConfig, state: str | None = None) -> str:
    """Rend la roue des saisons en SVG autonome.

    ``state`` : ``None`` pour la roue animée (état par défaut = décennie récente,
    oscillant vers la décennie ancienne) ; sinon une des deux clés de
    ``document["decades"]`` pour une figure figée sur cette seule décennie.
    """

    if state is not None and state not in document["decades"]:
        raise ValueError(f"état inconnu : {state!r}")

    id_prefix = f"wheel-{re.sub(r'[^A-Za-z0-9_-]', '-', state or 'anim')}"
    # Centre ancré en haut à ``margin`` du bord (pas à height/2) : la hauteur restante sous
    # la roue ne sert qu'au cartouche, la marge visible autour de l'horloge reste ``margin``.
    outer_extent = config.arrow_arc_radius + config.combined_label_offset + config.label_radial_allowance
    cx = config.width / 2.0
    cy = config.margin + outer_extent
    early_key, late_key = document["early_period"], document["late_period"]
    early = document["decades"][early_key]
    late = document["decades"][late_key]
    animate = state is None and config.animation_enabled

    if config.auto_orient:
        auto_top_doy = geometry.compute_horizontal_top_doy(late, config.year_days, config.clockwise)
        config = config.merged({"top_doy": auto_top_doy})

    if state is None:
        ring_early_boundaries, ring_late_boundaries = early, late
    else:
        selected = document["decades"][state]
        ring_early_boundaries = ring_late_boundaries = selected

    early_spans = geometry.season_spans(ring_early_boundaries, config.top_doy, config.year_days, config.clockwise)
    late_spans = geometry.season_spans(ring_late_boundaries, config.top_doy, config.year_days, config.clockwise)
    shifts = geometry.shift_spans(early, late, config.top_doy, config.year_days, config.clockwise)

    ring_elements = _season_ring(cx, cy, config, early_spans, late_spans, id_prefix)
    if config.show_active_markers:
        marker_elements, marker_keyframes = _active_markers(
            cx, cy, config, ring_early_boundaries, ring_late_boundaries, animate, id_prefix
        )
    else:
        marker_elements, marker_keyframes = [], []
    keyframes = marker_keyframes

    aria_label = f"Roue des saisons thermiques, comparaison {document['early_label']} et {document['late_label']}"
    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_n(config.width, 0)} {_n(config.height, 0)}" '
        f'width="{_n(config.width, 0)}" height="{_n(config.height, 0)}" role="img" '
        f'aria-label="{aria_label}">'
    )
    if config.google_font_import_url:
        # & doit être échappé en XML : l'URL Google Fonts en contient un (...&display=swap).
        font_url = config.google_font_import_url.replace("&", "&amp;")
        parts.append(f'<style>@import url("{font_url}");</style>')
    if keyframes:
        reduced_motion = (
            "@media (prefers-reduced-motion: reduce) { .wheel-animated { animation: none !important; } }"
            if config.respect_reduced_motion else ""
        )
        parts.append(f"<style>{''.join(keyframes)}{reduced_motion}</style>")
    parts.append(_defs(cx, cy, config, id_prefix))
    parts.append(f'<rect x="0" y="0" width="{_n(config.width, 0)}" height="{_n(config.height, 0)}" fill="{config.background}" />')

    parts.extend(_debug_guides(cx, cy, config))
    parts.append(f'<circle cx="{_n(cx)}" cy="{_n(cy)}" r="{_n(config.hub_radius)}" fill="{config.paper}" stroke="{config.line}" />')
    parts.extend(ring_elements)
    parts.extend(_season_name_labels(cx, cy, config, early_spans, late_spans, id_prefix))
    parts.extend(_fixed_boundary_ticks(cx, cy, config, early, late))
    parts.extend(marker_elements)
    parts.extend(_month_ring(cx, cy, config))
    parts.extend(_arrow_circle(cx, cy, config))
    parts.extend(_shift_arrows(cx, cy, config, shifts))
    parts.extend(_combined_boundary_labels(cx, cy, config, shifts, id_prefix))
    parts.extend(_caption(cx, config, document))

    parts.append("</svg>")
    return "\n".join(parts)
