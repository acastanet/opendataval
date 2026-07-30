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

# L'IGN ne publie pas la date de prise de vue de cette dalle. Faute de mieux, on retient une
# déclinaison de campagne estivale : elle place la hauteur solaire au milieu de la fourchette
# admise par la portée des ombres mesurée sur l'image.
ASSUMED_DECLINATION_DEG = 20.0

# Recalage de l'orthophotographie : rayon de recherche et grossissement du premier passage.
REGISTRATION_SEARCH_M = 6.0
REGISTRATION_COARSE_FACTOR = 4
REGISTRATION_REFINE_PX = 5


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


def _shift(mask: np.ndarray, rows: int, columns: int) -> np.ndarray:
    """Translate un masque sans repliement d'un bord de grille sur l'autre."""
    size = mask.shape[0]
    moved = np.zeros_like(mask)
    moved[max(0, rows) : size - max(0, -rows), max(0, columns) : size - max(0, -columns)] = mask[
        max(0, -rows) : size - max(0, rows), max(0, -columns) : size - max(0, columns)
    ]
    return moved


def shadow_azimuth(luminance: np.ndarray, mask: np.ndarray, resolution: float) -> float:
    """Direction vers laquelle portent les ombres, en degrés géographiques.

    Pour chaque azimut, on décale le masque bâti et on mesure la luminance des pixels ainsi
    atteints qui ne sont pas eux-mêmes du bâti. La direction la plus sombre est l'ombre.
    """
    totals: dict[int, list[float]] = {}
    for distance in SAMPLE_DISTANCES_M:
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
    return float(min(means, key=lambda bearing: means[bearing]))


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
    elevation = elevation_for_azimuth(scene_latitude(config), azimuth, ASSUMED_DECLINATION_DEG)
    return OrthoSun(azimuth, max(5.0, elevation), "mesure des ombres")


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
    # La ligne de l'image croît vers le sud : sa composante nord s'y oppose.
    return OrthoOffset(
        columns * resolution, -rows * resolution, f"recalage sur {count} emprises"
    )


def report_ortho_sun(config: PocConfig, run_dir: Path | None = None) -> OrthoSun:
    run_dir = run_dir or latest_run(config, require_complete=True)
    sun = measure_ortho_sun(config, run_dir)
    print(
        f"Soleil de l'orthophotographie : azimut {sun.azimuth_deg:.0f}°, "
        f"hauteur {sun.elevation_deg:.0f}° ({sun.source})"
    )
    updates: dict[str, object] = {"orthoSun": sun.as_metadata()}
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
        print(f"AVERTISSEMENT : calage de l'orthophotographie non mesuré ({error}).")

    metadata = run_dir / "render" / "scene.json"
    if metadata.is_file():
        content = json.loads(metadata.read_text(encoding="utf-8"))
        content.update(updates)
        metadata.write_text(
            json.dumps(content, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"Métadonnées mises à jour : {metadata}")
    return sun
