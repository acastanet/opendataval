"""Végétation haute : proxys d'arbres reconstruits depuis le modèle de hauteur de canopée.

Plus d'un quart de l'emprise est sous couvert boisé et n'existait pas en 3D : les arbres
n'étaient que de la peinture plate sur le terrain, ce qui trahit le rendu plus sûrement que
n'importe quel défaut de toiture.

L'approche reste délibérément sobre : hauteur de canopée, maxima locaux pour les cimes,
rayon de couronne par profil radial, puis un volume simple par arbre. BD Forêt V2 ne pilote
qu'un profil feuillu, conifère ou mixte à l'échelle de sa plage cartographiée. Pas de
segmentation botanique individuelle ni de panneau orienté caméra — à 200 m l'enjeu est la
présence, pas le réalisme botanique.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from pathlib import Path
import json
import math
import urllib.parse
import urllib.request
import zlib

import numpy as np

from .config import PocConfig, latest_run
from .raster import maximum_filter


# Proportions d'un arbre proxy, exprimées en fraction de sa hauteur totale. Elles ne
# prétendent à rien de plus qu'une silhouette crédible à distance de rue.
TRUNK_FRACTION = 0.35
# Le houppier descend jusqu'à 0,22 × h, sommet inchangé à 1,02 × h. Les proportions
# précédentes laissaient un tiers de la hauteur en fût nu : à l'échelle de l'emprise, un
# couvert de 358 arbres se lisait alors comme un champ de champignons.
CROWN_CENTRE_FRACTION = 0.62
CROWN_HALF_HEIGHT_FRACTION = 0.40
TRUNK_HALF_WIDTH_FRACTION = 0.045
MINIMUM_TRUNK_HALF_WIDTH_M = 0.12
MINIMUM_CROWN_RADIUS_M = 1.2
# Le rayon de couronne s'arrête là où la canopée retombe sous la moitié de la cime : c'est
# le critère le plus stable sur un modèle de hauteur bruité.
CROWN_HEIGHT_RATIO = 0.5
FOREST_WFS_URL = "https://data.geopf.fr/wfs/ows"
FOREST_WFS_LAYER = "LANDCOVER.FORESTINVENTORY.V2:formation_vegetale"


@dataclass(frozen=True)
class Tree:
    """Un arbre proxy, en Lambert-93 et en mètres."""

    x: float
    y: float
    ground: float
    height: float
    crown: float
    foliage: str = "generic"
    essence: str | None = None

    def as_json(self) -> dict[str, float | str]:
        result: dict[str, float | str] = {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "ground": round(self.ground, 2),
            "height": round(self.height, 2),
            "crown": round(self.crown, 2),
            "foliage": self.foliage,
        }
        if self.essence:
            result["essence"] = self.essence
        return result


def _inside_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    """Test pair-impair sans dépendance SIG, suffisant pour les polygones GeoJSON du WFS."""
    inside = False
    for first, second in zip(ring, ring[1:] + ring[:1]):
        ax, ay = float(first[0]), float(first[1])
        bx, by = float(second[0]), float(second[1])
        if (ay > y) == (by > y):
            continue
        crossing = (bx - ax) * (y - ay) / (by - ay) + ax
        if x < crossing:
            inside = not inside
    return inside


def _inside_polygon(x: float, y: float, polygon: list[list[list[float]]]) -> bool:
    return bool(
        polygon
        and _inside_ring(x, y, polygon[0])
        and not any(_inside_ring(x, y, hole) for hole in polygon[1:])
    )


def _foliage_kind(essence: object) -> str:
    label = str(essence or "").casefold()
    if "mixte" in label:
        return "mixed"
    if "conif" in label or "résine" in label:
        return "conifer"
    if "feuill" in label or "châtaign" in label or "chêne" in label or "peupl" in label:
        return "deciduous"
    return "generic"


def classify_forest_types(trees: list[Tree], payload: dict) -> list[Tree]:
    """Affecte à chaque cime l'essence de la plage BD Forêt qui la contient."""
    formations = []
    for feature in payload.get("features", []):
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        polygons = coordinates if geometry.get("type") == "MultiPolygon" else [coordinates]
        properties = feature.get("properties") or {}
        essence = str(properties.get("essence") or properties.get("tfv") or "").strip()
        if polygons and essence:
            formations.append((polygons, essence))

    classified = []
    for tree in trees:
        match = next(
            (
                essence
                for polygons, essence in formations
                if any(_inside_polygon(tree.x, tree.y, polygon) for polygon in polygons)
            ),
            None,
        )
        classified.append(
            replace(tree, foliage=_foliage_kind(match), essence=match) if match else tree
        )
    return classified


def download_forest_types(config: PocConfig) -> dict:
    """Récupère les seules formations BD Forêt qui croisent l'emprise de terrain."""
    xmin, ymin, xmax, ymax = config.terrain_bbox
    crs = "urn:ogc:def:crs:EPSG::2154"
    params = {
        "SERVICE": "WFS",
        "VERSION": "2.0.0",
        "REQUEST": "GetFeature",
        "TYPENAMES": FOREST_WFS_LAYER,
        "SRSNAME": crs,
        "BBOX": f"{xmin:g},{ymin:g},{xmax:g},{ymax:g},{crs}",
        "OUTPUTFORMAT": "application/json",
    }
    request = urllib.request.Request(
        FOREST_WFS_URL + "?" + urllib.parse.urlencode(params),
        headers={"User-Agent": config.get("HTTP_USER_AGENT", "OpenDataVdA-POC/2.0")},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise RuntimeError("Réponse WFS BD Forêt inattendue")
    return payload


def _crown_radius(canopy: np.ndarray, row: int, column: int, height: float, resolution: float, maximum_m: float) -> float:
    """Rayon de couronne, mesuré par retombée du profil radial autour de la cime."""
    reach = max(1, int(round(maximum_m / resolution)))
    first, last = max(0, row - reach), min(canopy.shape[0], row + reach + 1)
    left, right = max(0, column - reach), min(canopy.shape[1], column + reach + 1)
    window = canopy[first:last, left:right]
    rows, columns = np.meshgrid(
        (np.arange(first, last) - row) * resolution,
        (np.arange(left, right) - column) * resolution,
        indexing="ij",
    )
    distance = np.hypot(rows, columns)
    threshold = height * CROWN_HEIGHT_RATIO
    radius = MINIMUM_CROWN_RADIUS_M
    for edge in np.arange(resolution, maximum_m + resolution, resolution):
        ring = (distance > edge - resolution) & (distance <= edge)
        covered = window[ring]
        covered = covered[np.isfinite(covered)]
        # Un anneau vide signifie que la canopée s'est interrompue : la couronne s'arrête là.
        if covered.size == 0 or float(covered.mean()) < threshold:
            break
        radius = float(edge)
    return min(max(radius, MINIMUM_CROWN_RADIUS_M), maximum_m)


def detect_trees(
    config: PocConfig,
    canopy: np.ndarray,
    terrain: np.ndarray,
) -> list[Tree]:
    """Retient une cime par maximum local du modèle de hauteur de canopée.

    Les maxima sont parcourus du plus haut au plus bas et se suppriment mutuellement dans la
    fenêtre de détection : sans cela, un houppier large produirait une grappe de doublons.
    """
    resolution = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
    minimum_height = config.get_float("VEGETATION_MIN_HEIGHT_M", 4.0)
    window_m = config.get_float("VEGETATION_PEAK_WINDOW_M", 5.0)
    maximum_crown = config.get_float("VEGETATION_MAX_CROWN_M", 6.4)
    if minimum_height <= 0 or window_m <= 0:
        raise ValueError("VEGETATION_MIN_HEIGHT_M et VEGETATION_PEAK_WINDOW_M doivent être positifs")

    xmin, _, _, ymax = config.terrain_bbox
    filled = np.where(np.isfinite(canopy), canopy, 0.0)
    reach = max(1, int(round(window_m / (2 * resolution))))
    candidates = np.argwhere((filled >= minimum_height) & (filled >= maximum_filter(filled, reach)))
    if candidates.size == 0:
        return []
    order = np.argsort(-filled[candidates[:, 0], candidates[:, 1]])
    taken = np.zeros(filled.shape, dtype=bool)
    trees: list[Tree] = []
    for row, column in candidates[order]:
        first, last = max(0, row - reach), min(filled.shape[0], row + reach + 1)
        left, right = max(0, column - reach), min(filled.shape[1], column + reach + 1)
        if taken[first:last, left:right].any():
            continue
        taken[row, column] = True
        height = float(filled[row, column])
        trees.append(
            Tree(
                x=xmin + (column + 0.5) * resolution,
                y=ymax - (row + 0.5) * resolution,
                ground=float(terrain[row, column]),
                height=height,
                crown=_crown_radius(canopy, int(row), int(column), height, resolution, maximum_crown),
            )
        )
    return trees


def load_trees(run_dir: Path) -> list[Tree]:
    """Relit ``trees.json``, ou rien du tout si l'étape végétation n'a pas été exécutée."""
    source = run_dir / "trees.json"
    if not source.is_file():
        return []
    payload = json.loads(source.read_text(encoding="utf-8"))
    return [
        Tree(
            float(entry["x"]),
            float(entry["y"]),
            float(entry["ground"]),
            float(entry["height"]),
            float(entry["crown"]),
            str(entry.get("foliage", "generic")),
            str(entry["essence"]) if entry.get("essence") else None,
        )
        for entry in payload.get("trees", [])
    ]


def create_vegetation(config: PocConfig, run_dir: Path | None = None) -> Path:
    run_dir = run_dir or latest_run(config, require_complete=True)
    canopy_path = run_dir / "canopy.npy"
    terrain_path = run_dir / "terrain.npy"
    if not canopy_path.is_file() or not terrain_path.is_file():
        raise FileNotFoundError("Exécuter d'abord la commande terrain : canopy.npy est requis")

    canopy = np.load(canopy_path)
    terrain = np.load(terrain_path)
    if canopy.shape != terrain.shape:
        raise RuntimeError("canopy.npy et terrain.npy ne partagent pas la même grille")
    trees = detect_trees(config, canopy, terrain)
    forest_source = None
    if trees and config.get_bool("VEGETATION_FOREST_TYPES", False):
        try:
            forest_payload = download_forest_types(config)
            trees = classify_forest_types(trees, forest_payload)
            forest_source = {
                "url": FOREST_WFS_URL,
                "layer": FOREST_WFS_LAYER,
                "features": len(forest_payload["features"]),
            }
        except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
            print(f"AVERTISSEMENT : typologie BD Forêt indisponible ({error}).")

    destination = run_dir / "trees.json"
    covered = float(np.isfinite(canopy).mean())
    foliage_counts: dict[str, int] = {}
    for tree in trees:
        foliage_counts[tree.foliage] = foliage_counts.get(tree.foliage, 0) + 1
    metadata = {
        "count": len(trees),
        "canopyCoverage": round(covered, 3),
        "minimumHeightM": config.get_float("VEGETATION_MIN_HEIGHT_M", 4.0),
        "foliage": dict(sorted(foliage_counts.items())),
        "trees": [tree.as_json() for tree in trees],
    }
    if forest_source:
        metadata["forestSource"] = forest_source
    destination.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if trees:
        heights = sorted(tree.height for tree in trees)
        typed = len(trees) - foliage_counts.get("generic", 0)
        print(
            f"Végétation : {len(trees)} arbres, hauteur médiane "
            f"{heights[len(heights) // 2]:.1f} m, maximum {heights[-1]:.1f} m "
            f"({covered:.0%} de l'emprise sous canopée, {typed} typés par BD Forêt)"
        )
    else:
        print("Végétation : aucune cime détectée (classe LiDAR 5 absente ou trop basse).")
    return destination


# Vert de référence du feuillage, en sRGB. Il sert d'ancre : une cime mal détectée tombant
# sur un toit ou une route ne doit pas produire un arbre orange.
REFERENCE_FOLIAGE = (0.31, 0.42, 0.24)
# Part de la teinte mesurée dans le mélange final. Assez haute pour que les nuances réelles
# du couvert ressortent, assez basse pour borner une erreur de détection.
MEASURED_TINT_SHARE = 0.65
# Luminance sRGB visée après normalisation. L'orthophotographie porte les ombres de la prise
# de vue ; sans cette remise à niveau, un arbre photographié à l'ombre ressortirait noir,
# alors que l'éclairement de la scène est déjà calculé par ailleurs.
TARGET_LUMINANCE = 0.42
LUMINANCE_WEIGHTS = (0.2126, 0.7152, 0.0722)


def _normalised_tint(sample: np.ndarray) -> tuple[float, float, float]:
    """Ramène une couleur échantillonnée à la luminance de référence, teinte conservée."""
    luminance = sum(weight * channel for weight, channel in zip(LUMINANCE_WEIGHTS, sample))
    if luminance <= 1e-6:
        return REFERENCE_FOLIAGE
    scaled = [min(1.0, channel * TARGET_LUMINANCE / luminance) for channel in sample]
    return tuple(
        MEASURED_TINT_SHARE * measured + (1.0 - MEASURED_TINT_SHARE) * reference
        for measured, reference in zip(scaled, REFERENCE_FOLIAGE)
    )


def sample_foliage_tints(
    trees: list[Tree],
    ortho: np.ndarray,
    uv: object,
) -> list[tuple[float, float, float]]:
    """Teinte sRGB de chaque houppier, moyennée sur l'orthophotographie sous sa couronne.

    L'image contient déjà la couleur réelle de chaque arbre — châtaigniers, chênes verts et
    résineux ne se ressemblent pas. L'échantillonner coûte une lecture d'image et supprime à
    la fois la monotonie d'une palette fixe et la discordance entre le proxy et l'arbre peint
    sous lui.
    """
    height, width = ortho.shape[:2]
    tints: list[tuple[float, float, float]] = []
    for tree in trees:
        u_min, v_min = uv(tree.x - tree.crown, tree.y + tree.crown)
        u_max, v_max = uv(tree.x + tree.crown, tree.y - tree.crown)
        left = int(np.clip(round(min(u_min, u_max) * width), 0, width - 1))
        right = int(np.clip(round(max(u_min, u_max) * width), 0, width - 1))
        top = int(np.clip(round(min(v_min, v_max) * height), 0, height - 1))
        bottom = int(np.clip(round(max(v_min, v_max) * height), 0, height - 1))
        window = ortho[top : bottom + 1, left : right + 1]
        if window.size == 0:
            tints.append(REFERENCE_FOLIAGE)
            continue
        tints.append(_normalised_tint(window.reshape(-1, window.shape[-1])[:, :3].mean(axis=0)))
    return tints


# Icosaèdre régulier : vingt faces suffisent à lire un houppier à distance de rue, et
# l'ensemble de la végétation tient alors dans quelques milliers de triangles. Les sommets
# sont ramenés à une boîte englobante de ±1 sur chaque axe — et non à la sphère unité — pour
# que la cime du proxy atteigne exactement la hauteur mesurée.
_PHI = (1 + math.sqrt(5)) / 2
_ICOSAHEDRON_VERTICES = tuple(
    tuple(component / _PHI for component in vertex)
    for vertex in (
        (-1, _PHI, 0), (1, _PHI, 0), (-1, -_PHI, 0), (1, -_PHI, 0),
        (0, -1, _PHI), (0, 1, _PHI), (0, -1, -_PHI), (0, 1, -_PHI),
        (_PHI, 0, -1), (_PHI, 0, 1), (-_PHI, 0, -1), (-_PHI, 0, 1),
    )
)
_ICOSAHEDRON_FACES = (
    (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
    (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
    (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
    (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
)


# Sommets consommés par un houppier dans la primitive fusionnée du feuillage. Les triangles
# d'un arbre étant émis d'affilée, ce pas suffit à retrouver chaque houppier dans le tampon —
# c'est ce qui permet au visualiseur de les redimensionner autour de leur propre centre.
CROWN_VERTICES = len(_ICOSAHEDRON_FACES) * 3

# Amplitude du relief d'un houppier, en fraction de son rayon. La rotation et l'ovalité
# cassent la répétition d'un arbre au suivant, mais pas la régularité de chacun : un icosaèdre
# reste une boule à facettes dès qu'on l'approche. Tirer le rayon de chaque sommet autour de
# sa valeur nominale lui donne une silhouette, sans un triangle ni un octet de plus.
CROWN_IRREGULARITY = 0.18


def crown_relief(tree: Tree, irregularity: float = CROWN_IRREGULARITY) -> tuple[float, ...]:
    """Facteur de rayon par sommet d'icosaèdre, stable pour un arbre donné.

    Le relief ne porte que sur le rayon horizontal. Étirer aussi la verticale déplacerait la
    cime, alors qu'elle doit rester exactement à la hauteur mesurée par le LiDAR — c'est le
    seul chiffre que le proxy est censé restituer.

    Comme pour les teintes de bâtiment, le CRC remplace ``hash`` : un arbre doit garder sa
    silhouette d'une génération de la scène à l'autre.
    """
    if irregularity <= 0.0:
        return tuple(1.0 for _ in _ICOSAHEDRON_VERTICES)
    seed = zlib.crc32(f"relief:{tree.x:.2f}:{tree.y:.2f}".encode("utf-8"))
    # Un CRC par sommet, et non douze décalages du même : des décalages successifs rejouent
    # les mêmes bits d'un sommet au suivant, et le houppier se bosselle régulièrement —
    # exactement la régularité qu'on cherche à casser.
    return tuple(
        1.0 + irregularity * ((zlib.crc32(bytes([index]), seed) % 2001) / 1000.0 - 1.0)
        for index in range(len(_ICOSAHEDRON_VERTICES))
    )


def crown_triangles(
    centre: tuple[float, float, float],
    radius: float,
    half_height: float,
    rotation: float = 0.0,
    ovality: float = 1.0,
    profile: str = "generic",
    relief: Sequence[float] | None = None,
) -> list[list[tuple[float, float, float]]]:
    """Houppier : icosaèdre étiré verticalement, dans le repère GLB (Y vers le haut).

    ``rotation`` et ``ovality`` cassent la répétition d'un solide identique recopié des
    centaines de fois. ``profile`` n'affine que la cime des plages classées conifères par
    BD Forêt ; il ne prétend pas reconstruire l'essence d'un arbre individuel. ``relief``
    donne le rayon de chaque sommet, mesuré par :func:`crown_relief` ; absent, le houppier
    reste l'icosaèdre régulier des exécutions précédentes.
    """
    cosine, sine = math.cos(rotation), math.sin(rotation)
    scaled = []
    for index, vertex in enumerate(_ICOSAHEDRON_VERTICES):
        if profile == "conifer":
            radial_profile = max(0.12, (1.0 - vertex[1]) / 2.0)
        elif profile == "mixed":
            radial_profile = 0.75 + 0.25 * max(0.12, (1.0 - vertex[1]) / 2.0)
        else:
            radial_profile = 1.0
        radial_profile *= relief[index] if relief else 1.0
        east = vertex[0] * radius * ovality * radial_profile
        south = vertex[2] * radius / ovality * radial_profile
        scaled.append(
            (
                centre[0] + east * cosine - south * sine,
                centre[1] + vertex[1] * half_height,
                centre[2] + east * sine + south * cosine,
            )
        )
    return [[scaled[a], scaled[b], scaled[c]] for a, b, c in _ICOSAHEDRON_FACES]


def trunk_triangles(
    base: tuple[float, float, float], half_width: float, height: float
) -> list[list[tuple[float, float, float]]]:
    """Fût : prisme à section carrée, suffisant sous un houppier opaque."""
    x, y, z = base
    corners = [
        (x - half_width, z - half_width),
        (x + half_width, z - half_width),
        (x + half_width, z + half_width),
        (x - half_width, z + half_width),
    ]
    triangles: list[list[tuple[float, float, float]]] = []
    for first, second in zip(corners, corners[1:] + corners[:1]):
        low_a = (first[0], y, first[1])
        low_b = (second[0], y, second[1])
        high_a = (first[0], y + height, first[1])
        high_b = (second[0], y + height, second[1])
        triangles.append([low_a, low_b, high_b])
        triangles.append([low_a, high_b, high_a])
    return triangles


def tree_shape(tree: Tree) -> tuple[float, float]:
    """Rotation et ovalité du houppier, tirées de façon stable de la position de l'arbre.

    Le CRC sert ici comme pour les teintes de bâtiment : un arbre doit garder sa silhouette
    d'une génération de la scène à l'autre, ce que ``hash`` ne garantit pas.
    """
    seed = zlib.crc32(f"{tree.x:.2f}:{tree.y:.2f}".encode("utf-8"))
    rotation = (seed % 360) * math.pi / 180.0
    # Une couronne parfaitement circulaire n'existe pas ; ±15 % suffisent à rompre l'alignement.
    ovality = 1.0 + ((seed >> 9) % 31 - 15) / 100.0
    return rotation, ovality


def crown_centre(
    tree: Tree, centre: tuple[float, float], base_elevation: float
) -> tuple[float, float, float]:
    """Centre du houppier dans le repère de la scène GLB.

    Il sert deux fois : à construire le solide, et à orienter ses normales — un houppier
    étant étoilé autour de ce point. Le calculer à deux endroits l'aurait fait diverger dès
    la première retouche des proportions.
    """
    centre_x, centre_y = centre
    return (
        tree.x - centre_x,
        tree.ground - base_elevation + tree.height * CROWN_CENTRE_FRACTION,
        centre_y - tree.y,
    )


def tree_geometry(
    tree: Tree,
    centre: tuple[float, float],
    base_elevation: float,
    irregularity: float = 0.0,
) -> tuple[list[list[tuple[float, float, float]]], list[list[tuple[float, float, float]]]]:
    """Houppier et fût d'un arbre, ramenés au repère de la scène GLB.

    Le repère suit celui des bâtiments : X vers l'est, Y vers le haut à partir de
    ``base_elevation``, Z vers le sud.

    ``irregularity`` vaut zéro par défaut : la géométrie reste alors celle des exécutions
    précédentes, et c'est la configuration de la scène qui décide d'y ajouter du relief.
    """
    centre_x, centre_y = centre
    x = tree.x - centre_x
    z = centre_y - tree.y
    ground = tree.ground - base_elevation
    rotation, ovality = tree_shape(tree)
    crown = crown_triangles(
        crown_centre(tree, centre, base_elevation),
        max(tree.crown, MINIMUM_CROWN_RADIUS_M),
        tree.height * CROWN_HALF_HEIGHT_FRACTION,
        rotation,
        ovality,
        tree.foliage,
        crown_relief(tree, irregularity),
    )
    half_width = max(MINIMUM_TRUNK_HALF_WIDTH_M, tree.height * TRUNK_HALF_WIDTH_FRACTION)
    trunk = trunk_triangles((x, ground, z), half_width, tree.height * TRUNK_FRACTION)
    return crown, trunk
