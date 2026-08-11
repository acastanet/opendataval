"""Surface de contrôle visuelle de la roue des saisons.

Toutes les valeurs qui pilotent l'apparence (rayons, angles, épaisseurs,
palette, typographie, animation) sont regroupées ici, jamais dans render.py.
Aucune valeur scientifique (dates, seuils, décalages) ne doit apparaître dans
ce fichier : elle vient exclusivement du JSON produit par le moteur V4.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any


@dataclass
class WheelConfig:
    # --- Toile -----------------------------------------------------------
    # width/height resserrés sur l'horloge : le centre n'est plus figé à height/2 mais
    # ancré en haut à ``margin`` du bord (voir render_wheel_svg), la hauteur en plus ne
    # sert qu'au cartouche du bas — la marge visible autour de la roue est donc ``margin``.
    width: float = 972.0  # resserré autour de la roue, recalé pour le rayon des cartouches
    height: float = 1078.0  # place la roue en haut + cartouche en bas, idem
    margin: float = 16.0  # -60 % (40 -> 16), marge réelle autour de l'horloge
    background: str = "#f8f7f3"

    # --- Rayons (px, du centre vers l'extérieur) ----------------------------
    # « diminuer le cercle des saisons » = diminuer l'horloge entière (tous les rayons à
    # l'échelle), pas seulement season_outer isolément : sinon un vide se creuse entre
    # l'anneau des saisons et l'anneau des mois au lieu de faire vraiment rétrécir ce
    # quadrant. Facteur -20 % appliqué à l'ensemble depuis season_outer vers l'extérieur.
    hub_radius: float = 28.8  # -20 % (36 -> 28,8)
    season_inner: float = 28.8  # collé au disque central
    season_outer: float = 298.4  # collé au cercle des mois (= month_ring_inner)
    season_name_radius: float = 250.0  # trop près du bord extérieur à 270 : reculé (100 -> 200 -> 270 -> 250)
    season_name_curve_half_span_deg: float = 28.0
    # Sous été et hiver : évolution de la durée de la saison entre les deux décennies
    # (+/- x jours), sur un cercle légèrement plus intérieur que le nom de la saison.
    season_duration_delta_offset: float = 36.0
    season_duration_delta_size: float = 28.0  # +40 % (20 -> 28)
    # Deux anneaux concentriques statiques dans l'espace des saisons (ancienne décennie
    # à l'intérieur, récente à l'extérieur) — remplace l'unique anneau animé en va-et-vient :
    # les deux décennies sont visibles en même temps. Chaque couche est entourée d'un
    # cercle pointillé (pas de cercle intermédiaire plein).
    season_ring_split_radius: float = 163.6  # milieu de season_inner/season_outer
    season_ring_outline_color: str = "#c9ccc4"  # = line
    season_ring_outline_width: float = 1.8  # pointillés accentués (1 -> 1,8)
    season_ring_outline_dash: str = "3 3"
    # Avec le 1er janvier fixe en haut, les saisons ne tombent plus près de 12/3/6/9 h :
    # centré sur le milieu réel du secteur plutôt que plaqué sur une heure ronde.
    season_name_lock_to_cardinal: bool = False
    month_ring_inner: float = 298.4  # -20 % (373 -> 298,4), même proportion avec season_outer
    month_ring_outer: float = 328.0  # -20 % (410 -> 328)
    arrow_arc_radius: float = 360.0  # -20 % (450 -> 360)
    active_marker_hub_overlap_pct: float = 0.15  # les aiguilles animées mordent sur le disque central
    active_marker_tip_shrink_pct: float = 0.05  # -5 % de longueur côté pointe (extérieur), le côté moyeu ne bouge pas

    # --- Graduations du mois : visibilité renforcée (traits + cercles plus marqués,
    # majeures en ink au lieu de muted, mineures en muted au lieu de line) ---------------
    tick_month_length: float = 18.0  # index de mois allongés comme sur une montre (8 -> 18)
    tick_minor_length: float = 4.0  # -20 % (5 -> 4)
    tick_minor_step_days: int = 5
    tick_width: float = 1.6  # renforcé (1 -> 1.6)
    month_ring_circle_width: float = 1.6  # renforcé (1 -> 1.6), couleur muted au lieu de line

    # --- Repère angulaire --------------------------------------------------
    # top_doy n'est utilisé que si auto_orient est faux.
    auto_orient: bool = False  # 1er janvier fixe en haut (plus d'auto-orientation été/hiver)
    top_doy: float = 1.0  # 1er janvier à 12 h
    clockwise: bool = True
    year_days: int = 365

    # --- Limites fixes (repères des deux décennies, toujours visibles, colorées
    # selon la saison adjacente — voir BOUNDARY_SHIFT_SEASON dans render.py). Les deux
    # utilisent la couleur pleine (bleu/rouge), jamais la teinte pâle du dégradé qui
    # rendrait le pointillé quasi blanc ; seule l'opacité distingue ancien/récent. -----
    early_width: float = 2.4  # pointillés accentués (1,6 -> 2,4)
    early_dash: str = "4 3"
    early_extend: float = 12.8  # -20 % (16 -> 12,8)
    early_tick_opacity: float = 0.5

    late_width: float = 2.4  # pointillés accentués (1,6 -> 2,4)
    late_dash: str = "4 3"
    late_extend: float = 12.8  # -20 % (16 -> 12,8)
    late_tick_opacity: float = 1.0

    # --- Limite active (animée), forme d'aiguille feuille (pointue aux deux bouts,
    # renflée au milieu) : largeur max au renflement = active_leaf_width_factor × active_width ---
    show_active_markers: bool = True  # permet une version sans aiguilles (render_wheel.py écrit les deux)
    active_color: str = "#002fa7"  # bleu Klein foncé
    active_width: float = 3.0
    active_leaf_width_factor: float = 2.0  # renflement max = 2x l'épaisseur, ne touche pas la flèche

    # --- Flèches de décalage -------------------------------------------------
    arrow_color: str = "#b63835"  # rouge (= red), plus épaisses et rouges
    arrow_width: float = 3.5  # +75 % (2 -> 3,5)
    arrow_head_size: float = 9.0
    arrow_gap_deg: float = 2.5
    show_arrow_circle: bool = True
    arrow_circle_color: str = "#c9ccc4"
    arrow_circle_width: float = 1.0

    # --- Étiquette combinée sur le cercle des flèches : "13 sept. +14,5 22 sept." ---
    # (plus de « j » après le nombre de jours : le cartouche en arc suffit à l'identifier)
    combined_label_offset: float = 45.0  # rapproché du centre (70 -> 45)
    combined_label_half_span_deg: float = 20.0
    label_radial_allowance: float = 40.0  # au-delà du cercle des dates, réservé pour la hauteur du texte (cadre serré)
    # Cartouche élargi pour englober toute l'étiquette (dates + décalage), pas seulement
    # le nombre de jours. Largeur adaptée au texte (pas d'angle fixe) : estimée à partir
    # du nombre de caractères, faute de mesure réelle de police (zéro dépendance de rendu).
    combined_label_badge_enabled: bool = True  # cartouche en secteur de couronne derrière toute l'étiquette
    combined_label_badge_char_width_factor: float = 0.58  # trop long : -20 % (0,725 -> 0,58)
    combined_label_badge_horizontal_padding: float = 1.6  # -20 % (2,0 -> 1,6)
    combined_label_badge_padding: float = 1.625  # épaisseur (radiale) du cartouche = shift_size × ce facteur
    combined_label_badge_color: str = "#efeee9"  # = surface
    shift_value_letter_spacing: str = "0.1em"  # espacement des lettres du nombre de jours
    combined_label_badge_stroke_color: str = "#5e6661"  # = muted, contour du cartouche
    combined_label_badge_stroke_width: float = 1.2

    # --- Typographie ---------------------------------------------------------
    font_family: str = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    month_size: float = 15.0
    season_size: float = 39.9  # +33 % (30 -> 39,9)
    # Noms de saison : police plume élégante (Google Fonts), centrée sur le rayon
    # (dominant-baseline) plutôt que posée dessus. google_font_import_url est chargée par
    # @import dans le SVG (nécessite une connexion réseau au moment de l'affichage — c'est
    # une étape de conception, l'intégration en base64 se fera si le design est figé).
    # Dancing Script : plus lisible que Great Vibes à cette taille (lettres plus ouvertes,
    # moins de fioritures qui se chevauchent) tout en restant une police plume élégante.
    season_name_font_family: str = "'Dancing Script', 'Segoe Script', cursive"
    season_name_font_weight: str = "700"  # trait plus épais = plus lisible en script
    season_name_letter_spacing: str = "normal"  # le tracking casse la liaison des lettres en script
    google_font_import_url: str = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap"
    date_size: float = 18.72  # -20 % pour le cartouche (23,4 -> 18,72)
    shift_size: float = 35.7  # +70 % (21 -> 35,7)
    caption_size: float = 12.0
    letter_spacing: str = "0.04em"
    uppercase_labels: bool = True
    date_color_late: str = "#002fa7"  # bleu Klein foncé, décennie récente
    date_color_early: str = "#9fb2e0"  # bleu Klein clair, décennie ancienne

    # --- Palette (par défaut alignée sur styles.css) --------------------------
    paper: str = "#f8f7f3"
    surface: str = "#efeee9"
    ink: str = "#1b211f"
    muted: str = "#5e6661"
    line: str = "#c9ccc4"
    red: str = "#b63835"
    winter: str = "#2f6f95"
    spring: str = "#a8c77e"
    summer: str = "#c1392b"
    autumn: str = "#c97f55"

    # --- Anneau des saisons : été et hiver seuls, en dégradé radial ------------
    # couleur pleine au centre (près du disque central), s'éclaircit vers l'extérieur
    fill_spring_autumn: bool = False
    summer_gradient_start: str = "#c1392b"
    summer_gradient_end: str = "#fbe4d5"
    winter_gradient_start: str = "#2f6f95"
    winter_gradient_end: str = "#e2f0f7"

    # --- Animation -------------------------------------------------------------
    animation_enabled: bool = True
    hold_seconds: float = 2.0
    transition_seconds: float = 1.5
    easing: str = "cubic-bezier(0.65, 0, 0.35, 1)"
    respect_reduced_motion: bool = True

    # --- Étiquettes --------------------------------------------------------------
    date_rounding: str = "nearest"  # nearest | floor
    show_month_names: bool = True
    show_season_names: bool = True
    show_shift_values: bool = True
    show_caption: bool = True

    # --- Conception ------------------------------------------------------------
    debug_guides: bool = False

    def merged(self, overrides: dict[str, Any]) -> "WheelConfig":
        """Retourne une copie avec les clés reconnues de ``overrides`` appliquées."""

        known = {f.name for f in fields(self)}
        unknown = sorted(set(overrides) - known)
        if unknown:
            raise ValueError(f"Paramètres de roue inconnus : {', '.join(unknown)}")
        data = asdict(self)
        data.update(overrides)
        return WheelConfig(**data)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2) + "\n"

    @classmethod
    def from_file(cls, path: Path) -> "WheelConfig":
        """Charge une config depuis un JSON, en repartant des valeurs par défaut pour
        toute clé absente du fichier."""

        if not path.is_file():
            return cls()
        overrides = json.loads(path.read_text(encoding="utf-8"))
        return cls().merged(overrides)


def default_config_json() -> str:
    return WheelConfig().to_json()
