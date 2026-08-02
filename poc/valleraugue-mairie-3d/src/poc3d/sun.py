"""Calibration de l'orthophotographie : soleil d'origine et calage planimétrique.

L'orthophotographie IGN est une photographie aérienne, et deux de ses propriétés se
retrouvent dans la scène :

- elle porte les **ombres de l'instant de la prise de vue**. Le terrain l'utilisant comme
  couleur de base, tout éclairage calculé s'y multiplie : placer le soleil ailleurs que celui
  du cliché produit deux jeux d'ombres contradictoires, que nul réglage ne rattrape ;
- elle n'est **pas calée sur les données bâties**. Sur ce site, le recalage du masque des
  emprises sur l'image révèle un écart constant de plusieurs mètres, sans dépendance à la
  hauteur des bâtiments — ce n'est donc pas la parallaxe d'une orthophoto rectifiée au sol,
  mais un défaut de calage entre produits, amplifié par le relief.

Les deux grandeurs se mesurent sur l'image elle-même : l'azimut solaire en corrélant le masque
des emprises avec la luminance, le calage en recherchant la translation qui superpose ce même
masque aux toitures.

Ces deux mesures reposent sur le bâti, et **ne valent que là où il est étendu et contrasté**.
Ailleurs, elles ne rendent pas une valeur bruitée mais une valeur franchement fausse, d'allure
normale : le calage s'échappe jusqu'à la borne de son domaine de recherche dès que les toitures
sont moins rouges que le sol, et la direction d'ombre dérive sans que la netteté du creux le
signale. Chacune est donc assortie de conditions d'application explicites, et se refuse plutôt
que de rendre un chiffre invérifiable — le pipeline sait se passer des deux.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import math

import numpy as np

from .config import PocConfig, latest_run
from .footprints import iter_ground_footprints
from .geodesy import bbox_centre, lambert93_to_wgs84
from .raster import inside_polygon, polygon_window


# Distances d'échantillonnage autour des emprises. Trop près, on mord sur les toitures ;
# trop loin, l'ombre s'est déjà dissipée.
SAMPLE_DISTANCES_M = (3.0, 5.0, 8.0)
AZIMUTH_STEP_DEG = 5
MINIMUM_SAMPLE_PX = 500
SHADOW_MIN_RELIEF = 0.03

# L'IGN ne publie pas la date de prise de vue de cette dalle. Faute de mieux, on retient une
# déclinaison de campagne estivale : elle place la hauteur solaire au milieu de la fourchette
# admise par la portée des ombres mesurée sur l'image.
ASSUMED_DECLINATION_DEG = 20.0

# Recalage de l'orthophotographie : rayon de recherche et grossissement du premier passage.
REGISTRATION_SEARCH_M = 6.0
REGISTRATION_COARSE_FACTOR = 4
REGISTRATION_REFINE_PX = 5

# Conditions sous lesquelles le critère colorimétrique a une prise sur l'image. Mesuré sur les
# scènes du POC : contraste de +16,9 à +24,3 et surface bâtie de 3,4 à 25,2 % là où le recalage
# converge ; contraste de -13,8 (Chaos de Nîmes-le-Vieux) et -6,0 (Col de Perjuret) pour 2,0 et
# 0,1 % de surface là où il s'échappait jusqu'à la borne du domaine.
REGISTRATION_MIN_CONTRAST = 8.0
REGISTRATION_MIN_COVERAGE = 0.01

# Recoupement de l'azimut solaire par les ombres des houppiers. La direction d'ombre mesurée
# autour du bâti est fiable là où le bâti est étendu, et dérive ailleurs sans que la netteté du
# creux le trahisse : au Col de Perjuret, cinq bâtiments donnent le creux le plus marqué des
# scènes du POC. Seule une seconde source tranche. Écarts mesurés entre les deux mesures :
# 5° (Perjuret), 10° (Creyssensac) et 15° (Valleraugue) là où elles se confirment, 60° au Chaos
# de Nîmes-le-Vieux où celle du bâti est démentie par les ombres des rochers.
SHADOW_CROSS_CHECK_DEG = 30.0
# Les houppiers portent des ombres bien plus longues que les murs : l'échantillonnage se règle
# sur leur hauteur médiane plutôt que sur les distances fixes du bâti.
CANOPY_SAMPLE_FACTORS = (0.6, 0.9, 1.3)
# Sous-échantillonnage de la passe houppiers : une direction d'ombre au pas de 5° n'a que faire
# du décimètre, et la mesure se fait sur toute l'image.
CANOPY_SHADOW_FACTOR = 4
# Azimuts qu'une prise de vue aérienne peut porter sous nos latitudes. Une campagne IGN vole
# autour du midi solaire ; hors de cette plage, la mesure a suivi autre chose que le soleil —
# le recoupement des houppiers de Notre-Dame-de-la-Rouvière sort à 30°, soit un soleil au
# nord-est, que la France ne connaît qu'au lever.
PLAUSIBLE_SUN_AZIMUTH_DEG = (80.0, 300.0)


@dataclass(frozen=True)
class OrthoSun:
    """Position solaire attribuée à l'orthophotographie."""

    azimuth_deg: float
    elevation_deg: float
    source: str

    def as_metadata(self) -> dict[str, object]:
        return {
            "azimuthDeg": round(self.azimuth_deg, 1),
            "elevationDeg": round(self.elevation_deg, 1),
            "source": self.source,
        }


def solar_position(
    latitude: float, longitude: float, moment: datetime
) -> tuple[float, float]:
    """Azimut et hauteur du soleil, en degrés, selon l'algorithme NOAA simplifié.

    L'azimut est géographique : 0° au nord, croissant vers l'est.
    """
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    utc = moment.astimezone(timezone.utc)
    julian_day = (utc - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)) / timedelta(days=1)
    century = julian_day / 36525.0

    mean_longitude = math.radians((280.46646 + century * 36000.76983) % 360)
    mean_anomaly = math.radians(357.52911 + century * 35999.05029)
    equation_of_centre = math.radians(
        (1.914602 - century * 0.004817) * math.sin(mean_anomaly)
        + 0.019993 * math.sin(2 * mean_anomaly)
    )
    true_longitude = mean_longitude + equation_of_centre
    obliquity = math.radians(23.439291 - century * 0.0130042)
    declination = math.asin(math.sin(obliquity) * math.sin(true_longitude))
    right_ascension = math.atan2(
        math.cos(obliquity) * math.sin(true_longitude), math.cos(true_longitude)
    )

    sidereal = math.radians((280.46061837 + 360.98564736629 * julian_day) % 360)
    hour_angle = sidereal + math.radians(longitude) - right_ascension

    phi = math.radians(latitude)
    elevation = math.asin(
        math.sin(phi) * math.sin(declination)
        + math.cos(phi) * math.cos(declination) * math.cos(hour_angle)
    )
    azimuth = math.atan2(
        -math.sin(hour_angle) * math.cos(declination),
        math.cos(phi) * math.sin(declination)
        - math.sin(phi) * math.cos(declination) * math.cos(hour_angle),
    )
    return math.degrees(azimuth) % 360.0, math.degrees(elevation)


def elevation_for_azimuth(latitude: float, azimuth_deg: float, declination_deg: float) -> float:
    """Hauteur du soleil compatible avec un azimut donné, à déclinaison fixée.

    Sert à recouper la mesure d'ombre : l'azimut se mesure bien sur l'image, la portée des
    ombres beaucoup moins en tissu bâti dense où elles se recouvrent.
    """
    phi = math.radians(latitude)
    declination = math.radians(declination_deg)
    azimuth = math.radians(azimuth_deg)
    # sin(δ) = sin(φ)sin(h) + cos(φ)cos(h)cos(A), résolu en h par l'angle auxiliaire.
    amplitude = math.hypot(math.sin(phi), math.cos(phi) * math.cos(azimuth))
    if amplitude == 0:
        return 0.0
    ratio = math.sin(declination) / amplitude
    if abs(ratio) > 1:
        return 0.0
    return math.degrees(math.asin(ratio) - math.atan2(math.cos(phi) * math.cos(azimuth), math.sin(phi)))


def scene_latitude(config: PocConfig) -> float:
    """Latitude géographique de la scène, renseignée ou déduite de son emprise."""
    centre = config.scene_centre_wgs84
    if centre is not None:
        return centre[0]
    _, latitude = lambert93_to_wgs84(*bbox_centre(config.terrain_bbox))
    return latitude


def require_square_extent(config: PocConfig) -> None:
    """Refuse une mesure sur une emprise non carrée, plutôt que d'en rendre une fausse.

    Toute la calibration raisonne en pixels avec une résolution unique, déduite de la seule
    largeur : la requête WMS est carrée, et le masque bâti l'est aussi. Sur une emprise
    rectangulaire, les lignes couvriraient la même distance que les colonnes — le masque
    déborderait de tout le rapport d'aspect, et le recalage sortirait un chiffre plausible
    et faux, sans rien signaler.

    Le rendu, lui, reste correct : les coordonnées de texture sont normalisées sur la bbox
    et compensent exactement l'anamorphose de l'image.
    """
    xmin, ymin, xmax, ymax = config.terrain_bbox
    width, height = xmax - xmin, ymax - ymin
    if abs(width - height) > 0.01:
        raise RuntimeError(
            f"Emprise non carrée ({width:g} × {height:g} m) : la calibration de "
            "l'orthophotographie n'est pas applicable. Renseigner ORTHO_SUN_AZIMUTH_DEG, "
            "ORTHO_SUN_ELEVATION_DEG, ORTHO_OFFSET_EAST et ORTHO_OFFSET_NORTH."
        )


def footprint_mask(config: PocConfig, run_dir: Path, size: int) -> tuple[np.ndarray, int]:
    """Rastérise les emprises bâties sur la grille de l'orthophotographie."""
    xmin, _, xmax, ymax = config.terrain_bbox
    resolution = (xmax - xmin) / size
    mask = np.zeros((size, size), dtype=bool)
    columns = xmin + (np.arange(size) + 0.5) * resolution
    rows = ymax - (np.arange(size) + 0.5) * resolution
    grid_x, grid_y = np.meshgrid(columns, rows)
    cityjson = sorted((run_dir / "roofer_output").glob("*.city.jsonl"))
    count = 0
    for polygon, _ in iter_ground_footprints(cityjson):
        polygon_x = np.array([point[0] for point in polygon])
        polygon_y = np.array([point[1] for point in polygon])
        window = polygon_window(polygon_x, polygon_y, xmin, ymax, resolution, mask.shape)
        if window is None:
            continue
        first, last, left, right = window
        mask[first : last + 1, left : right + 1] |= inside_polygon(
            polygon_x,
            polygon_y,
            grid_x[first : last + 1, left : right + 1],
            grid_y[first : last + 1, left : right + 1],
        )
        count += 1
    return mask, count


def canopy_mask(
    config: PocConfig, run_dir: Path, size: int
) -> tuple[np.ndarray, float] | None:
    """Rastérise les houppiers détectés, avec leur hauteur médiane.

    Rend `None` quand la végétation n'a pas été produite : la scène reste calibrable sur le
    seul bâti, simplement sans recoupement.
    """
    trees_path = run_dir / "trees.json"
    if not trees_path.is_file():
        return None
    try:
        trees = json.loads(trees_path.read_text(encoding="utf-8"))["trees"]
    except (KeyError, ValueError):
        return None
    if not trees:
        return None

    xmin, _, xmax, ymax = config.terrain_bbox
    resolution = (xmax - xmin) / size
    mask = np.zeros((size, size), dtype=bool)
    rows, columns = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    for tree in trees:
        centre_column = (tree["x"] - xmin) / resolution
        centre_row = (ymax - tree["y"]) / resolution
        radius = max(2.0, tree["crown"] / resolution)
        first, last = int(max(0, centre_row - radius)), int(min(size, centre_row + radius + 1))
        left, right = int(max(0, centre_column - radius)), int(min(size, centre_column + radius + 1))
        if first >= last or left >= right:
            continue
        offset_rows = rows[first:last, left:right] - centre_row
        offset_columns = columns[first:last, left:right] - centre_column
        mask[first:last, left:right] |= (
            offset_rows**2 + offset_columns**2
        ) <= radius**2
    if not mask.any():
        return None
    return mask, float(np.median([tree["height"] for tree in trees]))


def _shift(mask: np.ndarray, rows: int, columns: int) -> np.ndarray:
    """Translate un masque sans repliement d'un bord de grille sur l'autre."""
    size = mask.shape[0]
    moved = np.zeros_like(mask)
    moved[max(0, rows) : size - max(0, -rows), max(0, columns) : size - max(0, -columns)] = mask[
        max(0, -rows) : size - max(0, rows), max(0, -columns) : size - max(0, columns)
    ]
    return moved


def shadow_azimuth(
    luminance: np.ndarray,
    mask: np.ndarray,
    resolution: float,
    distances: tuple[float, ...] = SAMPLE_DISTANCES_M,
) -> float:
    """Direction vers laquelle portent les ombres, en degrés géographiques.

    Pour chaque azimut, on décale le masque bâti et on mesure la luminance des pixels ainsi
    atteints qui ne sont pas eux-mêmes du bâti. La direction la plus sombre est l'ombre.
    """
    totals: dict[int, list[float]] = {}
    for distance in distances:
        for bearing in range(0, 360, AZIMUTH_STEP_DEG):
            offset_columns = distance * math.sin(math.radians(bearing)) / resolution
            # La ligne de la grille croît vers le sud : la composante nord s'y oppose.
            offset_rows = -distance * math.cos(math.radians(bearing)) / resolution
            sample = _shift(mask, int(round(offset_rows)), int(round(offset_columns))) & ~mask
            if sample.sum() < MINIMUM_SAMPLE_PX:
                continue
            totals.setdefault(bearing, []).append(float(luminance[sample].mean()))
    if not totals:
        raise RuntimeError("Emprises trop petites pour mesurer une direction d'ombre")
    means = {bearing: sum(values) / len(values) for bearing, values in totals.items()}
    darkest = min(means, key=lambda bearing: means[bearing])
    # Seuil du cas dégénéré — une image sans ombre portée du tout — et non un indice de
    # justesse : le creux vaut de 10 % (Valleraugue 600 m) à 30 % (Col de Perjuret) sur les
    # scènes du POC, sans rapport avec la fiabilité de la direction trouvée.
    median = float(np.median(list(means.values())))
    if median <= 0 or (median - means[darkest]) / median < SHADOW_MIN_RELIEF:
        raise RuntimeError("Aucune ombre portée mesurable autour des volumes")
    return float(darkest)


def measure_ortho_sun(config: PocConfig, run_dir: Path | None = None) -> OrthoSun:
    """Retrouve la position solaire de l'orthophotographie, ou applique celle configurée."""
    from PIL import Image

    run_dir = run_dir or latest_run(config, require_complete=True)
    forced_azimuth = config.get("ORTHO_SUN_AZIMUTH_DEG", "")
    forced_elevation = config.get("ORTHO_SUN_ELEVATION_DEG", "")
    if forced_azimuth and forced_elevation:
        return OrthoSun(float(forced_azimuth), float(forced_elevation), "configuration")

    require_square_extent(config)
    ortho_path = run_dir / "orthophoto.jpg"
    if not ortho_path.is_file():
        raise FileNotFoundError(f"Orthophotographie absente : {ortho_path}")
    with Image.open(ortho_path) as image:
        luminance = np.asarray(image.convert("L"), dtype=np.float64)
    size = luminance.shape[0]
    xmin, _, xmax, _ = config.terrain_bbox
    resolution = (xmax - xmin) / size

    mask, _ = footprint_mask(config, run_dir, size)
    if not mask.any():
        raise RuntimeError("Aucune emprise bâtie pour calibrer le soleil")
    shadow = shadow_azimuth(luminance, mask, resolution)
    azimuth = (shadow + 180.0) % 360.0
    if not _plausible_azimuth(azimuth):
        raise RuntimeError(
            f"Soleil mesuré à {azimuth:.0f}° sur les ombres du bâti, hors de la plage "
            "qu'une prise de vue aérienne peut porter"
        )

    source = _cross_check_azimuth(config, run_dir, luminance, resolution, azimuth)
    elevation = elevation_for_azimuth(scene_latitude(config), azimuth, ASSUMED_DECLINATION_DEG)
    return OrthoSun(azimuth, max(5.0, elevation), source)


def _plausible_azimuth(azimuth: float) -> bool:
    low, high = PLAUSIBLE_SUN_AZIMUTH_DEG
    return low <= azimuth <= high


def _angular_gap(first: float, second: float) -> float:
    """Écart entre deux azimuts, en degrés, par le plus court des deux arcs."""
    return abs((first - second + 180.0) % 360.0 - 180.0)


def _cross_check_azimuth(
    config: PocConfig,
    run_dir: Path,
    luminance: np.ndarray,
    resolution: float,
    azimuth: float,
) -> str:
    """Confronte l'azimut mesuré sur le bâti à celui des ombres de houppiers.

    Rend le libellé de provenance de la mesure retenue, et refuse quand les deux sources se
    contredisent : la valeur du bâti est alors invérifiable, et un éclairage calculé à contre-
    sens des ombres de la photographie se voit sur toute la scène.
    """
    canopy = canopy_mask(config, run_dir, luminance.shape[0])
    if canopy is None:
        return "mesure des ombres du bâti"

    factor = CANOPY_SHADOW_FACTOR
    crowns, median_height = canopy
    try:
        crown_shadow = shadow_azimuth(
            luminance[::factor, ::factor],
            crowns[::factor, ::factor],
            resolution * factor,
            tuple(share * median_height for share in CANOPY_SAMPLE_FACTORS),
        )
    except RuntimeError:
        return "mesure des ombres du bâti"

    crown_azimuth = (crown_shadow + 180.0) % 360.0
    if not _plausible_azimuth(crown_azimuth):
        # Le houppier n'a rien à confirmer, mais rien à opposer non plus : la mesure du bâti
        # reste seule, ce que sa provenance dit.
        return "mesure des ombres du bâti"

    gap = _angular_gap(azimuth, crown_azimuth)
    if gap > SHADOW_CROSS_CHECK_DEG:
        raise RuntimeError(
            f"Ombres contradictoires : {azimuth:.0f}° sur le bâti contre "
            f"{crown_azimuth:.0f}° sur les houppiers, soit {gap:.0f}° d'écart"
        )
    return "mesure des ombres du bâti et des houppiers"


@dataclass(frozen=True)
class OrthoOffset:
    """Translation constante entre l'orthophotographie et les données bâties, en mètres."""

    east_m: float
    north_m: float
    source: str

    def as_metadata(self) -> dict[str, object]:
        return {
            "eastMetres": round(self.east_m, 2),
            "northMetres": round(self.north_m, 2),
            "source": self.source,
        }


def _peak_shift(
    roofness: np.ndarray, mask: np.ndarray, radius_px: int, step: int = 1
) -> tuple[int, int]:
    """Translation en pixels amenant le masque bâti sur les toitures les plus rouges."""
    best = (0, 0)
    best_score = -math.inf
    for rows in range(-radius_px, radius_px + 1, step):
        for columns in range(-radius_px, radius_px + 1, step):
            moved = np.roll(np.roll(mask, rows, axis=0), columns, axis=1)
            score = float(roofness[moved].mean())
            if score > best_score:
                best_score, best = score, (rows, columns)
    return best


def measure_ortho_offset(config: PocConfig, run_dir: Path | None = None) -> OrthoOffset:
    """Retrouve le calage de l'orthophotographie sur les emprises bâties.

    Le critère est colorimétrique — rouge moins bleu — et non lumineux : une zone d'ombre,
    sombre et uniforme, piégerait un critère de variance ou de gradient, alors qu'elle ne
    peut jamais maximiser la teinte d'une tuile.

    La recherche porte sur toutes les emprises à la fois : bâtiment par bâtiment, le bruit
    de recalage atteint plusieurs mètres et masque complètement la translation cherchée.

    Ce critère suppose des **toitures plus rouges que leur environnement**, ce qui vaut pour
    un village de tuiles et pas partout : sur les causses, des toits de tôle et de fibrociment
    posés sur un sol ocre inversent le contraste, et maximiser le rouge chasse alors le masque
    hors du bâti, jusqu'à la borne du domaine de recherche. Les trois refus ci-dessous
    reconnaissent ce cas plutôt que d'en rendre une translation plausible et fausse : le
    pipeline retombe sur l'absence de calage, qui s'est révélée juste sur les sites concernés.
    """
    from PIL import Image

    run_dir = run_dir or latest_run(config, require_complete=True)
    forced_east = config.get("ORTHO_OFFSET_EAST", "")
    forced_north = config.get("ORTHO_OFFSET_NORTH", "")
    if forced_east and forced_north:
        return OrthoOffset(float(forced_east), float(forced_north), "configuration")

    require_square_extent(config)
    ortho_path = run_dir / "orthophoto.jpg"
    if not ortho_path.is_file():
        raise FileNotFoundError(f"Orthophotographie absente : {ortho_path}")
    with Image.open(ortho_path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.float64)
    roofness = rgb[:, :, 0] - rgb[:, :, 2]
    size = roofness.shape[0]
    xmin, _, xmax, _ = config.terrain_bbox
    resolution = (xmax - xmin) / size

    mask, count = footprint_mask(config, run_dir, size)
    if count < 5 or not mask.any():
        raise RuntimeError("Trop peu d'emprises bâties pour caler l'orthophotographie")

    coverage = float(mask.mean())
    if coverage < REGISTRATION_MIN_COVERAGE:
        raise RuntimeError(
            f"Emprises bâties trop peu étendues pour caler l'orthophotographie : "
            f"{coverage:.2%} de l'image, minimum {REGISTRATION_MIN_COVERAGE:.0%}"
        )
    contrast = float(roofness[mask].mean() - roofness.mean())
    if contrast < REGISTRATION_MIN_CONTRAST:
        raise RuntimeError(
            f"Toitures indiscernables de leur environnement : contraste rouge-bleu de "
            f"{contrast:+.1f} sous les emprises, minimum {REGISTRATION_MIN_CONTRAST:+.0f}"
        )

    # Passage grossier sur une image réduite, puis affinage au pixel : une recherche
    # exhaustive à pleine résolution demanderait plusieurs minutes.
    factor = REGISTRATION_COARSE_FACTOR
    coarse_radius = int(round(REGISTRATION_SEARCH_M / (resolution * factor)))
    coarse_rows, coarse_columns = _peak_shift(
        roofness[::factor, ::factor], mask[::factor, ::factor], coarse_radius
    )
    best_rows, best_columns = coarse_rows * factor, coarse_columns * factor
    fine = _peak_shift(
        np.roll(np.roll(roofness, -best_rows, axis=0), -best_columns, axis=1),
        mask,
        REGISTRATION_REFINE_PX,
    )
    rows, columns = best_rows + fine[0], best_columns + fine[1]
    # Un optimum posé sur la borne du domaine n'est pas un optimum : le critère y montait
    # encore. Filet générique, qui ne suppose rien du contenu de l'image.
    limit = coarse_radius * factor + REGISTRATION_REFINE_PX
    if abs(rows) >= limit or abs(columns) >= limit:
        raise RuntimeError(
            f"Recalage non convergent : la translation cherchée atteint la borne de "
            f"{limit * resolution:.1f} m du domaine de recherche"
        )
    # La ligne de l'image croît vers le sud : sa composante nord s'y oppose.
    return OrthoOffset(
        columns * resolution, -rows * resolution, f"recalage sur {count} emprises"
    )


def _outline(mask: np.ndarray) -> np.ndarray:
    """Bordure intérieure d'un masque, épaissie pour rester lisible après réduction."""
    interior = mask.copy()
    for axis in (0, 1):
        for step in (1, -1):
            interior &= np.roll(mask, step, axis=axis)
    edge = mask & ~interior
    thick = edge.copy()
    for axis in (0, 1):
        for step in (-2, -1, 1, 2):
            thick |= np.roll(edge, step, axis=axis)
    return thick


def write_registration_preview(
    config: PocConfig, run_dir: Path, offset: OrthoOffset | None
) -> Path | None:
    """Superpose les emprises bâties à l'orthophotographie, pour vérifier le calage à l'œil.

    C'est le seul contrôle qui tranche quand la mesure automatique est refusée : les contours
    sans calage y suivent les bâtiments, ou non, et l'écart se lit directement en mètres sur la
    photographie. De quoi renseigner `ORTHO_OFFSET_EAST` et `ORTHO_OFFSET_NORTH` à la main.
    """
    from PIL import Image

    ortho_path = run_dir / "orthophoto.jpg"
    if not ortho_path.is_file():
        return None
    with Image.open(ortho_path) as image:
        pixels = np.asarray(image.convert("RGB"), dtype=np.uint8).copy()
    size = pixels.shape[0]
    xmin, _, xmax, _ = config.terrain_bbox
    resolution = (xmax - xmin) / size

    mask, count = footprint_mask(config, run_dir, size)
    if not count or not mask.any():
        return None

    drawn = [("sans calage", (0.0, 0.0), (80, 255, 80))]
    if offset is not None:
        drawn.append(("calage retenu", (offset.east_m, offset.north_m), (80, 180, 255)))
    for _, (east, north), colour in drawn:
        # Le calage translate la texture ; le masque le suit en sens direct, la ligne de
        # l'image croissant vers le sud.
        moved = np.roll(
            np.roll(mask, int(round(-north / resolution)), axis=0),
            int(round(east / resolution)),
            axis=1,
        )
        pixels[_outline(moved)] = colour

    rows, columns = np.nonzero(mask)
    centre_row, centre_column = int(rows.mean()), int(columns.mean())
    half = min(size // 2, max(400, int(120.0 / resolution)))
    crop = Image.fromarray(
        pixels[
            max(0, centre_row - half) : centre_row + half,
            max(0, centre_column - half) : centre_column + half,
        ]
    )
    preview = run_dir / "ortho-registration.png"
    crop.save(preview)
    print(
        "Vignette de contrôle : "
        + preview.as_posix()
        + " — "
        + ", ".join(f"{label} en {colour}" for label, _, colour in drawn)
    )
    return preview


def report_ortho_sun(config: PocConfig, run_dir: Path | None = None) -> OrthoSun | None:
    run_dir = run_dir or latest_run(config, require_complete=True)
    updates: dict[str, object] = {}
    sun = None
    try:
        sun = measure_ortho_sun(config, run_dir)
        print(
            f"Soleil de l'orthophotographie : azimut {sun.azimuth_deg:.0f}°, "
            f"hauteur {sun.elevation_deg:.0f}° ({sun.source})"
        )
        updates["orthoSun"] = sun.as_metadata()
    except (OSError, RuntimeError, ValueError) as error:
        print(
            f"AVERTISSEMENT : calibration solaire non concluante ({error}). La scène se "
            "charge avec un soleil librement réglable ; renseigner ORTHO_SUN_AZIMUTH_DEG et "
            "ORTHO_SUN_ELEVATION_DEG dans la configuration pour le figer."
        )

    offset = None
    try:
        offset = measure_ortho_offset(config, run_dir)
        distance = math.hypot(offset.east_m, offset.north_m)
        bearing = math.degrees(math.atan2(offset.east_m, offset.north_m)) % 360
        print(
            f"Calage de l'orthophotographie : {distance:.2f} m vers {bearing:.0f}° "
            f"(est {offset.east_m:+.2f} m, nord {offset.north_m:+.2f} m — {offset.source})"
        )
        updates["orthoOffset"] = offset.as_metadata()
    except (OSError, RuntimeError, ValueError) as error:
        print(
            f"AVERTISSEMENT : calage de l'orthophotographie non mesuré ({error}). "
            "L'orthophotographie est drapée telle quelle ; la vignette ci-dessous dit si "
            "cela suffit, sinon renseigner ORTHO_OFFSET_EAST et ORTHO_OFFSET_NORTH."
        )

    try:
        write_registration_preview(config, run_dir, offset)
    except (OSError, ValueError) as error:
        print(f"AVERTISSEMENT : vignette de contrôle non écrite ({error}).")

    metadata = run_dir / "render" / "scene.json"
    if metadata.is_file():
        content = json.loads(metadata.read_text(encoding="utf-8"))
        content.update(updates)
        # Une mesure refusée doit effacer celle d'une exécution précédente : la garder
        # laisserait le visualiseur appliquer une calibration que l'on vient d'écarter.
        for key in ("orthoSun", "orthoOffset"):
            if key not in updates:
                content.pop(key, None)
        metadata.write_text(
            json.dumps(content, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"Métadonnées mises à jour : {metadata}")
    return sun
