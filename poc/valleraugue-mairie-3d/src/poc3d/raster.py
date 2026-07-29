"""Opérations sur la grille du MNT, partagées par l'assise du terrain et la scène GLB.

Ce module dépend de NumPy : ``cli`` ne l'importe donc jamais au chargement, afin que
``poc.py check`` puisse encore diagnostiquer une dépendance manquante.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


Window = tuple[int, int, int, int]


def inside_polygon(
    polygon_x: np.ndarray, polygon_y: np.ndarray, x: np.ndarray, y: np.ndarray
) -> np.ndarray:
    """Test d'appartenance par lancer de rayon, vectorisé sur une grille de centres."""
    inside = np.zeros(x.shape, dtype=bool)
    for current in range(len(polygon_x)):
        previous = current - 1
        y_current, y_previous = polygon_y[current], polygon_y[previous]
        straddles = (y_current > y) != (y_previous > y)
        if not straddles.any():
            continue
        with np.errstate(divide="ignore", invalid="ignore"):
            crossing = (polygon_x[previous] - polygon_x[current]) * (y - y_current) / (
                y_previous - y_current
            ) + polygon_x[current]
        inside ^= straddles & (x < crossing)
    return inside


def polygon_window(
    polygon_x: np.ndarray,
    polygon_y: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    shape: tuple[int, int],
) -> Window | None:
    """Fenêtre de cellules couvrant l'emprise, ou ``None`` si elle sort de la grille."""
    height, width = shape
    first = max(0, int((ymax - polygon_y.max()) // resolution))
    last = min(height - 1, int((ymax - polygon_y.min()) // resolution))
    left = max(0, int((polygon_x.min() - xmin) // resolution))
    right = min(width - 1, int((polygon_x.max() - xmin) // resolution))
    if last < first or right < left:
        return None
    return first, last, left, right


def expand_window(window: Window, shape: tuple[int, int], cells: int) -> Window:
    height, width = shape
    first, last, left, right = window
    return (
        max(0, first - cells),
        min(height - 1, last + cells),
        max(0, left - cells),
        min(width - 1, right + cells),
    )


def cell_centers(
    window: Window, xmin: float, ymax: float, resolution: float
) -> tuple[np.ndarray, np.ndarray]:
    first, last, left, right = window
    return np.meshgrid(
        xmin + (np.arange(left, right + 1) + 0.5) * resolution,
        ymax - (np.arange(first, last + 1) + 0.5) * resolution,
    )


def maximum_by_cell(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    shape: tuple[int, int],
) -> np.ndarray:
    """Altitude la plus haute de chaque cellule, ``NaN`` là où aucun point n'est tombé.

    Sert au modèle de surface comme au modèle de hauteur de canopée : c'est le maximum, et
    non la moyenne, qui décrit une cime ou un faîtage.
    """
    height, width = shape
    grid = np.full((height, width), np.nan)
    if x.size == 0:
        return grid
    columns = np.clip(np.floor((x - xmin) / resolution).astype(np.int64), 0, width - 1)
    rows = np.clip(np.floor((ymax - y) / resolution).astype(np.int64), 0, height - 1)
    flat = rows * width + columns
    # ``maximum.at`` est le seul chemin correct ici : plusieurs points partagent une cellule
    # et une affectation vectorisée ne garderait que le dernier.
    highest = np.full(width * height, -np.inf)
    np.maximum.at(highest, flat, z)
    reached = np.isfinite(highest)
    grid.reshape(-1)[reached] = highest[reached]
    return grid


def maximum_filter(grid: np.ndarray, radius_cells: int) -> np.ndarray:
    """Maximum local sur une fenêtre carrée, par dilatations séparables à pas doublant.

    Une fenêtre glissante explicite coûterait le carré du rayon en mémoire : sur la grille à
    0,5 m, une fenêtre de 5 m demanderait déjà deux cents mégaoctets.
    """
    if radius_cells < 1:
        return grid.copy()
    result = grid
    for axis in (0, 1):
        reached, offset = 0, 1
        while reached < radius_cells:
            # Le pas est borné par ce qu'il reste à couvrir : la fenêtre obtenue vaut alors
            # exactement le rayon demandé, sans débordement d'une puissance de deux.
            step = min(offset, radius_cells - reached)
            width = result.shape[axis]
            pad = ((step, step), (0, 0)) if axis == 0 else ((0, 0), (step, step))
            padded = np.pad(result, pad, mode="edge")
            back = padded[: -2 * step] if axis == 0 else padded[:, : -2 * step]
            forward = padded[2 * step :] if axis == 0 else padded[:, 2 * step :]
            result = np.maximum(result, np.maximum(back, forward))
            reached += step
            offset *= 2
            if width < 2:
                break
    return result


def dilate(mask: np.ndarray) -> np.ndarray:
    """Dilatation en 4-connexité, sans repliement d'un bord de grille sur l'autre."""
    grown = mask.copy()
    grown[1:, :] |= mask[:-1, :]
    grown[:-1, :] |= mask[1:, :]
    grown[:, 1:] |= mask[:, :-1]
    grown[:, :-1] |= mask[:, 1:]
    return grown


def erode(mask: np.ndarray) -> np.ndarray:
    """Érosion en 4-connexité. Le bord de grille compte comme extérieur au masque."""
    kept = mask.copy()
    kept[1:, :] &= mask[:-1, :]
    kept[:-1, :] &= mask[1:, :]
    kept[:, 1:] &= mask[:, :-1]
    kept[:, :-1] &= mask[:, 1:]
    kept[0, :] = kept[-1, :] = False
    kept[:, 0] = kept[:, -1] = False
    return kept


def close_mask(mask: np.ndarray, passes: int) -> np.ndarray:
    """Fermeture morphologique : comble les trous sans faire grossir l'emprise.

    Une classe LiDAR rasterisée est toujours trouée — sur l'eau, un tir sur deux ne revient
    pas. Dilater puis éroder du même nombre de passes rebouche ces manques en restituant à
    peu près le contour d'origine.
    """
    if passes < 1:
        return mask.copy()
    grown = mask
    for _ in range(passes):
        grown = dilate(grown)
    for _ in range(passes):
        grown = erode(grown)
    # L'érosion mord les bords de grille : les cellules mesurées ne doivent jamais disparaître.
    return grown | mask


def nearest_outward(values: np.ndarray, known: np.ndarray) -> np.ndarray:
    """Valeur minimale des voisines connues, pour prolonger un champ d'un cran."""
    source = np.where(known, values, np.inf)
    neighbour = np.full(values.shape, np.inf)
    neighbour[1:, :] = np.minimum(neighbour[1:, :], source[:-1, :])
    neighbour[:-1, :] = np.minimum(neighbour[:-1, :], source[1:, :])
    neighbour[:, 1:] = np.minimum(neighbour[:, 1:], source[:, :-1])
    neighbour[:, :-1] = np.minimum(neighbour[:, :-1], source[:, 1:])
    return neighbour


@dataclass(frozen=True)
class GridSampler:
    """Lecture d'une grille géoréférencée en un point Lambert-93, par plus proche cellule.

    L'interpolation bilinéaire serait inutile ici : les champs interrogés — facteur de vue du
    ciel, hauteur de dégagement — varient lentement devant la maille du MNT.
    """

    grid: np.ndarray
    xmin: float
    ymax: float
    resolution: float

    def at(self, x: np.ndarray | float, y: np.ndarray | float) -> np.ndarray:
        height, width = self.grid.shape
        columns = np.clip(
            np.floor((np.asarray(x, dtype=np.float64) - self.xmin) / self.resolution).astype(np.int64),
            0,
            width - 1,
        )
        rows = np.clip(
            np.floor((self.ymax - np.asarray(y, dtype=np.float64)) / self.resolution).astype(np.int64),
            0,
            height - 1,
        )
        return self.grid[rows, columns]


@dataclass(frozen=True)
class TerrainSampler:
    """Interroge le MNT pour dimensionner la jupe de chaque bâtiment."""

    grid: np.ndarray
    xmin: float
    ymax: float
    resolution: float

    def minimum_around(
        self, polygon_x: list[float], polygon_y: list[float], margin_cells: int = 2
    ) -> float | None:
        """Altitude la plus basse sous l'emprise et sur quelques cellules alentour.

        La jupe doit rejoindre le terrain juste au-delà du mur, pas seulement sous
        l'emprise : c'est là que le relief décroche du côté aval.
        """
        px = np.asarray(polygon_x, dtype=np.float64)
        py = np.asarray(polygon_y, dtype=np.float64)
        window = polygon_window(px, py, self.xmin, self.ymax, self.resolution, self.grid.shape)
        if window is None:
            return None
        window = expand_window(window, self.grid.shape, margin_cells)
        first, last, left, right = window
        x, y = cell_centers(window, self.xmin, self.ymax, self.resolution)
        mask = inside_polygon(px, py, x, y)
        for _ in range(margin_cells):
            mask = dilate(mask)
        if not mask.any():
            return None
        return float(self.grid[first : last + 1, left : right + 1][mask].min())
