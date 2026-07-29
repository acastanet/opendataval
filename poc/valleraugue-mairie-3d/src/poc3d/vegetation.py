"""Végétation haute : proxys d'arbres reconstruits depuis le modèle de hauteur de canopée.

Plus d'un quart de l'emprise est sous couvert boisé et n'existait pas en 3D : les arbres
n'étaient que de la peinture plate sur le terrain, ce qui trahit le rendu plus sûrement que
n'importe quel défaut de toiture.

L'approche est délibérément grossière : hauteur de canopée, maxima locaux pour les cimes,
rayon de couronne par profil radial, puis un volume simple par arbre. Pas de segmentation
individuelle, pas d'essence, pas de panneau orienté caméra — à 200 m l'enjeu est la présence,
pas le réalisme botanique.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math

import numpy as np

from .config import PocConfig, latest_run
from .raster import maximum_filter


# Proportions d'un arbre proxy, exprimées en fraction de sa hauteur totale. Elles ne
# prétendent à rien de plus qu'une silhouette crédible à distance de rue.
TRUNK_FRACTION = 0.35
CROWN_CENTRE_FRACTION = 0.68
CROWN_HALF_HEIGHT_FRACTION = 0.34
TRUNK_HALF_WIDTH_FRACTION = 0.045
MINIMUM_TRUNK_HALF_WIDTH_M = 0.12
MINIMUM_CROWN_RADIUS_M = 1.2
# Le rayon de couronne s'arrête là où la canopée retombe sous la moitié de la cime : c'est
# le critère le plus stable sur un modèle de hauteur bruité.
CROWN_HEIGHT_RATIO = 0.5


@dataclass(frozen=True)
class Tree:
    """Un arbre proxy, en Lambert-93 et en mètres."""

    x: float
    y: float
    ground: float
    height: float
    crown: float

    def as_json(self) -> dict[str, float]:
        return {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "ground": round(self.ground, 2),
            "height": round(self.height, 2),
            "crown": round(self.crown, 2),
        }


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
    maximum_crown = config.get_float("VEGETATION_MAX_CROWN_M", 6.0)
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

    destination = run_dir / "trees.json"
    covered = float(np.isfinite(canopy).mean())
    destination.write_text(
        json.dumps(
            {
                "count": len(trees),
                "canopyCoverage": round(covered, 3),
                "minimumHeightM": config.get_float("VEGETATION_MIN_HEIGHT_M", 4.0),
                "trees": [tree.as_json() for tree in trees],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    if trees:
        heights = sorted(tree.height for tree in trees)
        print(
            f"Végétation : {len(trees)} arbres, hauteur médiane "
            f"{heights[len(heights) // 2]:.1f} m, maximum {heights[-1]:.1f} m "
            f"({covered:.0%} de l'emprise sous canopée)"
        )
    else:
        print("Végétation : aucune cime détectée (classe LiDAR 5 absente ou trop basse).")
    return destination


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


def crown_triangles(
    centre: tuple[float, float, float], radius: float, half_height: float
) -> list[list[tuple[float, float, float]]]:
    """Houppier : icosaèdre étiré verticalement, dans le repère GLB (Y vers le haut)."""
    scaled = [
        (
            centre[0] + vertex[0] * radius,
            centre[1] + vertex[1] * half_height,
            centre[2] + vertex[2] * radius,
        )
        for vertex in _ICOSAHEDRON_VERTICES
    ]
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


def tree_geometry(
    tree: Tree, centre: tuple[float, float], base_elevation: float
) -> tuple[list[list[tuple[float, float, float]]], list[list[tuple[float, float, float]]]]:
    """Houppier et fût d'un arbre, ramenés au repère de la scène GLB.

    Le repère suit celui des bâtiments : X vers l'est, Y vers le haut à partir de
    ``base_elevation``, Z vers le sud.
    """
    centre_x, centre_y = centre
    x = tree.x - centre_x
    z = centre_y - tree.y
    ground = tree.ground - base_elevation
    crown = crown_triangles(
        (x, ground + tree.height * CROWN_CENTRE_FRACTION, z),
        max(tree.crown, MINIMUM_CROWN_RADIUS_M),
        tree.height * CROWN_HALF_HEIGHT_FRACTION,
    )
    half_width = max(MINIMUM_TRUNK_HALF_WIDTH_M, tree.height * TRUNK_HALF_WIDTH_FRACTION)
    trunk = trunk_triangles((x, ground, z), half_width, tree.height * TRUNK_FRACTION)
    return crown, trunk
