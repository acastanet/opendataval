"""Occlusion ambiante cuite : facteur de vue du ciel calculé sur le modèle de surface.

L'occlusion ambiante est ce qui *pose* les volumes : sans elle, une ruelle et une esplanade
reçoivent la même lumière ambiante et le bâti flotte. Le visualiseur la calculait en
post-traitement (GTAO), ce qui la rendait indisponible partout ailleurs — logiciel de rendu,
export, moteur tiers.

Ici elle est écrite dans la géométrie elle-même, en ``COLOR_0`` : n'importe quel moteur la
restitue en multipliant la couleur de base, sans passe supplémentaire ni coût d'affichage.

Le facteur de vue du ciel est la fraction de l'hémisphère visible depuis un point. Il se
mesure par balayage d'horizon : pour chaque azimut on cherche l'obstacle le plus haut
angulairement, puis on intègre. Pour un horizon d'angle H uniforme sur un azimut, la
contribution de cet azimut vaut cos²(H) — d'où la moyenne ci-dessous.
"""

from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

from .raster import GridSampler


# Le pas d'échantillonnage le long d'un rayon ne descend pas sous la maille : plus fin, il
# relit la même cellule sans rien apprendre.
MINIMUM_STEP_M = 0.5
# Plancher d'assombrissement : au-delà, les creux virent au noir et la scène cesse d'être
# lisible en mode diagnostic, ce qui est précisément l'usage du POC.
DARKEST = 0.35


def _shift_nearest(grid: np.ndarray, rows: int, columns: int) -> np.ndarray:
    """Translate une grille en prolongeant les bords, sans repliement.

    ``np.roll`` ferait réapparaître le versant est à l'ouest et créerait des horizons
    fantômes sur tout le pourtour de l'emprise.
    """
    height, width = grid.shape
    rows = int(np.clip(rows, -(height - 1), height - 1))
    columns = int(np.clip(columns, -(width - 1), width - 1))
    moved = grid
    if rows:
        moved = np.concatenate(
            (np.repeat(moved[:1], rows, axis=0), moved[:-rows])
            if rows > 0
            else (moved[-rows:], np.repeat(moved[-1:], -rows, axis=0))
        )
    if columns:
        moved = np.concatenate(
            (np.repeat(moved[:, :1], columns, axis=1), moved[:, :-columns])
            if columns > 0
            else (moved[:, -columns:], np.repeat(moved[:, -1:], -columns, axis=1)),
            axis=1,
        )
    return moved


def _look(grid: np.ndarray, rows: int, columns: int) -> np.ndarray:
    """Valeur de la cellule située ``(rows, columns)`` plus loin, vue depuis chaque cellule."""
    return _shift_nearest(grid, -rows, -columns)


def sky_view_factor(
    surface: np.ndarray,
    resolution: float,
    *,
    azimuths: int = 16,
    radius_m: float = 30.0,
) -> np.ndarray:
    """Fraction du ciel visible depuis chaque cellule du modèle de surface, dans [0, 1].

    Le rayon borne la recherche : au-delà d'une trentaine de mètres, un obstacle ne masque
    plus qu'une bande d'horizon négligeable en tissu bâti, et le coût croît linéairement.
    """
    if azimuths < 1:
        raise ValueError("OCCLUSION_AZIMUTHS doit valoir au moins 1")
    if radius_m <= 0 or resolution <= 0:
        return np.ones_like(surface)
    step = max(MINIMUM_STEP_M, resolution)
    distances = np.arange(step, radius_m + step, step)
    total = np.zeros_like(surface, dtype=np.float64)
    for index in range(azimuths):
        bearing = 2 * math.pi * index / azimuths
        # La ligne de la grille croît vers le sud : la composante nord s'y oppose.
        tangent = np.zeros_like(surface, dtype=np.float64)
        for distance in distances:
            rows = int(round(-distance * math.cos(bearing) / resolution))
            columns = int(round(distance * math.sin(bearing) / resolution))
            if rows == 0 and columns == 0:
                continue
            rise = _look(surface, rows, columns) - surface
            np.maximum(tangent, rise / distance, out=tangent)
        np.maximum(tangent, 0.0, out=tangent)
        # cos²(atan(t)) = 1 / (1 + t²) : l'arc tangente n'a pas à être calculée.
        total += 1.0 / (1.0 + tangent * tangent)
    return total / azimuths


def clearance(surface: np.ndarray, terrain: np.ndarray, resolution: float, radius_m: float) -> np.ndarray:
    """Hauteur au-dessus du sol à partir de laquelle un point domine ses obstacles.

    Un sommet de toiture voit tout le ciel alors que le pied du même mur n'en voit qu'une
    fraction : sans cette grandeur, une occlusion mesurée au sol noircirait les toitures.
    """
    reach = max(1, int(round(radius_m / max(resolution, 1e-9))))
    highest = surface
    # Dilatation par maximum en deux passes séparables, chacune à décalages doublants : le
    # résultat de l'étape précédente sert d'entrée à la suivante, ce qui couvre le rayon en
    # un nombre logarithmique de passes là où une fenêtre glissante coûterait son carré.
    for axis in (0, 1):
        offset = 1
        while offset <= reach:
            forward = (offset, 0) if axis == 0 else (0, offset)
            backward = (-offset, 0) if axis == 0 else (0, -offset)
            highest = np.maximum(
                highest, np.maximum(_look(highest, *forward), _look(highest, *backward))
            )
            offset *= 2
    return np.maximum(highest - terrain, 1.0)


@dataclass(frozen=True)
class BakedOcclusion:
    """Échantillonne l'occlusion en un sommet du repère GLB.

    L'occlusion dépend de la hauteur autant que de la position : au sol elle vaut le facteur
    de vue du ciel, et elle remonte vers le plein ciel à mesure que le sommet dépasse les
    obstacles voisins.
    """

    view_factor: GridSampler
    terrain: GridSampler
    clearance: GridSampler
    strength: float
    median_view_factor: float

    def at(self, x_l93: np.ndarray, y_l93: np.ndarray, elevation: np.ndarray) -> np.ndarray:
        view = self.view_factor.at(x_l93, y_l93)
        above = np.asarray(elevation, dtype=np.float64) - self.terrain.at(x_l93, y_l93)
        emerged = np.clip(above / self.clearance.at(x_l93, y_l93), 0.0, 1.0)
        exposure = view + (1.0 - view) * emerged
        return np.clip(1.0 - self.strength * (1.0 - exposure), DARKEST, 1.0)


def bake_occlusion(
    surface: np.ndarray,
    terrain: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    *,
    azimuths: int = 16,
    radius_m: float = 30.0,
    strength: float = 0.6,
) -> BakedOcclusion:
    view = sky_view_factor(surface, resolution, azimuths=azimuths, radius_m=radius_m)
    return BakedOcclusion(
        GridSampler(view, xmin, ymax, resolution),
        GridSampler(terrain, xmin, ymax, resolution),
        GridSampler(clearance(surface, terrain, resolution, radius_m), xmin, ymax, resolution),
        max(0.0, min(1.0, strength)),
        float(np.median(view)),
    )
