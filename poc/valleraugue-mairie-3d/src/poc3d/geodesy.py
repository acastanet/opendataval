"""Conversions RGF93 / Lambert-93 et nommage des dalles LiDAR HD.

Tout le pipeline raisonne en Lambert-93 (EPSG:2154), mais une emprise se choisit sur une
carte, donc en latitude et longitude. Ce module fait le pont, sans dépendance : `pyproj`
apporterait PROJ et sa base de grilles pour une seule projection conique conforme, alors
que la formule tient en trente lignes et que le POC s'interdit les dépendances SIG.

L'écart entre WGS84 et RGF93 est inférieur au mètre en métropole — soit deux mailles de
terrain — et n'est pas corrigé ici : la donnée IGN est diffusée en RGF93, et un point saisi
depuis une carte grand public l'est en WGS84. Confondre les deux est l'usage courant et
reste bien en deçà de la précision du modèle.
"""

from __future__ import annotations

from dataclasses import dataclass
import math


# GRS80, ellipsoïde du RGF93.
SEMI_MAJOR_AXIS = 6378137.0
INVERSE_FLATTENING = 298.257222101
ECCENTRICITY = math.sqrt(2 / INVERSE_FLATTENING - 1 / INVERSE_FLATTENING**2)

# Lambert-93 : conique conforme sécante, parallèles 44° et 49° (IGN NTG_71).
LATITUDE_ORIGIN = math.radians(46.5)
LONGITUDE_ORIGIN = math.radians(3.0)
FIRST_PARALLEL = math.radians(44.0)
SECOND_PARALLEL = math.radians(49.0)
FALSE_EASTING = 700000.0
FALSE_NORTHING = 6600000.0

# Domaine de validité annoncé du Lambert-93, en degrés. Au-delà, la projection reste
# calculable mais la déformation cesse d'être bornée — et surtout, il n'y a plus de LiDAR HD.
LONGITUDE_RANGE = (-9.86, 10.38)
LATITUDE_RANGE = (41.15, 51.56)

# Les dalles LiDAR HD couvrent un kilomètre carré.
TILE_SIZE_M = 1000


def _isometric_radius(latitude: float) -> float:
    """Rayon isométrique t(φ) de la conique conforme."""
    sine = ECCENTRICITY * math.sin(latitude)
    return math.tan(math.pi / 4 - latitude / 2) / ((1 - sine) / (1 + sine)) ** (ECCENTRICITY / 2)


def _parallel_scale(latitude: float) -> float:
    """Facteur m(φ) sur le parallèle."""
    return math.cos(latitude) / math.sqrt(1 - (ECCENTRICITY * math.sin(latitude)) ** 2)


_M1, _M2 = _parallel_scale(FIRST_PARALLEL), _parallel_scale(SECOND_PARALLEL)
_T1, _T2 = _isometric_radius(FIRST_PARALLEL), _isometric_radius(SECOND_PARALLEL)
_CONE = (math.log(_M1) - math.log(_M2)) / (math.log(_T1) - math.log(_T2))
_SCALE = _M1 / (_CONE * _T1**_CONE)
_RADIUS_ORIGIN = SEMI_MAJOR_AXIS * _SCALE * _isometric_radius(LATITUDE_ORIGIN) ** _CONE


def wgs84_to_lambert93(longitude: float, latitude: float) -> tuple[float, float]:
    """Projette un point géographique en Lambert-93, en mètres.

    L'ordre des arguments est celui du GeoJSON — longitude d'abord — et non celui d'un
    presse-papier de carte, qui donne la latitude en premier. La confusion coûte 300 km.
    """
    if not LONGITUDE_RANGE[0] <= longitude <= LONGITUDE_RANGE[1]:
        raise ValueError(f"Longitude {longitude} hors du domaine Lambert-93 {LONGITUDE_RANGE}")
    if not LATITUDE_RANGE[0] <= latitude <= LATITUDE_RANGE[1]:
        raise ValueError(f"Latitude {latitude} hors du domaine Lambert-93 {LATITUDE_RANGE}")
    longitude, latitude = math.radians(longitude), math.radians(latitude)
    radius = SEMI_MAJOR_AXIS * _SCALE * _isometric_radius(latitude) ** _CONE
    angle = _CONE * (longitude - LONGITUDE_ORIGIN)
    return (
        FALSE_EASTING + radius * math.sin(angle),
        FALSE_NORTHING + _RADIUS_ORIGIN - radius * math.cos(angle),
    )


def lambert93_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    """Inverse de `wgs84_to_lambert93`, en degrés (longitude, latitude).

    La latitude se retrouve par itération : l'inversion du rayon isométrique n'a pas de
    forme fermée. Dix tours suffisent au micromètre ; on en fait le double, le calcul
    n'ayant lieu qu'à la préparation d'une scène.
    """
    delta_x = easting - FALSE_EASTING
    delta_y = _RADIUS_ORIGIN - (northing - FALSE_NORTHING)
    radius = math.copysign(math.hypot(delta_x, delta_y), _CONE)
    angle = math.atan2(delta_x, delta_y)
    isometric = (radius / (SEMI_MAJOR_AXIS * _SCALE)) ** (1 / _CONE)
    latitude = math.pi / 2 - 2 * math.atan(isometric)
    for _ in range(20):
        sine = ECCENTRICITY * math.sin(latitude)
        latitude = math.pi / 2 - 2 * math.atan(
            isometric * ((1 - sine) / (1 + sine)) ** (ECCENTRICITY / 2)
        )
    return math.degrees(angle / _CONE + LONGITUDE_ORIGIN), math.degrees(latitude)


def square_bbox(easting: float, northing: float, side: float) -> tuple[float, float, float, float]:
    """Emprise carrée de `side` mètres centrée sur un point Lambert-93.

    Le centre est arrondi au mètre et le côté doit être pair : les bornes restent alors
    entières, ce qui rend la bbox lisible dans un `.conf` comme dans une commande amont, et
    aligne la maille du terrain — 0,5 m ou 1 m — sur des coordonnées rondes.

    L'emprise est carrée par obligation, pas par commodité : la requête WMS de
    l'orthophotographie l'est, et `poc.py sun` rastérise le masque bâti avec une résolution
    unique déduite de la seule largeur.
    """
    if side <= 0:
        raise ValueError("Le côté de l'emprise doit être strictement positif")
    if abs(side - round(side)) > 1e-9 or round(side) % 2 != 0:
        raise ValueError("Le côté de l'emprise doit être un nombre pair de mètres")
    half = round(side) // 2
    centre_x, centre_y = round(easting), round(northing)
    return (
        float(centre_x - half),
        float(centre_y - half),
        float(centre_x + half),
        float(centre_y + half),
    )


def bbox_centre(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    xmin, ymin, xmax, ymax = bbox
    return (xmin + xmax) / 2, (ymin + ymax) / 2


def lidar_tiles(bbox: tuple[float, float, float, float]) -> list[str]:
    """Dalles LiDAR HD recouvrant l'emprise, dans l'ordre de lecture d'une carte.

    Les dalles font 1 km² et portent le nom de leur coin **nord-ouest** exprimé en
    kilomètres : `LHD_FXX_0751_6332` couvre X 751000–752000 et Y 6331000–6332000. À passer
    l'emprise du terrain — la bbox élargie de `TERRAIN_MARGIN_M` — et non `POC_BBOX` : c'est
    elle que le nuage doit couvrir, et quinze mètres suffisent à faire franchir une limite
    de dalle.
    """
    xmin, ymin, xmax, ymax = bbox
    eastings = range(int(math.floor(xmin / TILE_SIZE_M)), int(math.floor(xmax / TILE_SIZE_M)) + 1)
    northings = range(int(math.floor(ymin / TILE_SIZE_M)), int(math.floor(ymax / TILE_SIZE_M)) + 1)
    return [
        f"LHD_FXX_{east:04d}_{north + 1:04d}"
        for north in reversed(northings)
        for east in eastings
    ]


@dataclass(frozen=True)
class Corners:
    """Les quatre coins d'une emprise en WGS84, pour un aperçu cartographique."""

    south_west: tuple[float, float]
    south_east: tuple[float, float]
    north_east: tuple[float, float]
    north_west: tuple[float, float]

    def as_ring(self) -> list[list[float]]:
        """Anneau GeoJSON fermé, sens antihoraire."""
        ring = [self.south_west, self.south_east, self.north_east, self.north_west]
        return [[round(longitude, 8), round(latitude, 8)] for longitude, latitude in ring] + [
            [round(self.south_west[0], 8), round(self.south_west[1], 8)]
        ]


def bbox_corners(bbox: tuple[float, float, float, float]) -> Corners:
    """Coins WGS84 d'une emprise Lambert-93.

    Un carré en Lambert-93 n'est pas un carré en WGS84 : les quatre coins sont convertis un
    à un plutôt que déduits d'un rectangle de longitudes et de latitudes, qui serait faux de
    plusieurs mètres du fait de la convergence des méridiens.
    """
    xmin, ymin, xmax, ymax = bbox
    return Corners(
        south_west=lambert93_to_wgs84(xmin, ymin),
        south_east=lambert93_to_wgs84(xmax, ymin),
        north_east=lambert93_to_wgs84(xmax, ymax),
        north_west=lambert93_to_wgs84(xmin, ymax),
    )
