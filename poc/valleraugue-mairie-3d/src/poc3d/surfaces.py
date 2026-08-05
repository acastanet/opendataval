"""Surfaces d'eau et tabliers de pont, reconstruits depuis les classes LiDAR 9 et 17.

Ces deux objets manquaient à la scène alors que la donnée était déjà là : le sous-ensemble
LiDAR téléchargé pour le terrain porte 23 000 points d'eau et 4 000 points de pont. Un village
de fond de vallée sans sa rivière, et un pont réduit au trou qu'il laisse dans le MNT, sont
les deux absences que l'œil relève en premier.

Le traitement est le même dans les deux cas — rasteriser une classe, fermer les trous du
masque, en tirer une nappe — et il reste grossier à dessein :

- **l'eau** tient sur un unique plan incliné. Ce n'est pas une commodité : l'ajustement aux
  moindres carrés sur le run 200 m laisse un résidu d'écart-type de 0,15 m sur 243 m de
  cours. Mailler la surface au demi-mètre décrirait du bruit de mesure ;
- **le tablier** est plat à 0,13 m près sur ses 10 × 20 m. Une altitude et une épaisseur
  suffisent ; ses piles ne sont dans aucune classe et les inventer serait de la fiction.

La nappe d'eau n'est **pas** recalée sur le terrain. Les deux s'entrecroisent — la moitié des
points d'eau passent sous le MNT interpolé, un dixième au-dessus — et cette intersection
produit gratuitement les bancs de galets émergents d'un étiage cévenol.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .raster import close_mask, maximum_by_cell


WATER_CLASS = 9
BRIDGE_CLASS = 17

# Passes de fermeture du masque. Trois passes rebouchent un trou de trois cellules, soit
# 1,5 m à la maille du terrain : au-delà, on relierait deux bras distincts d'un cours d'eau.
MASK_CLOSING_PASSES = 3
# Sous ce nombre de cellules, la classe est un résidu de classification et non un objet.
MINIMUM_CELLS = 20


@dataclass(frozen=True)
class Nappe:
    """Une surface horizontale ou faiblement inclinée, définie sur la grille du terrain.

    ``elevations`` porte l'altitude absolue en chaque cellule retenue et ``NaN`` ailleurs :
    c'est la même convention que ``canopy.npy``, ce qui permet de la stocker telle quelle.
    """

    elevations: np.ndarray

    @property
    def cells(self) -> int:
        return int(np.isfinite(self.elevations).sum())

    def is_empty(self) -> bool:
        return self.cells == 0


def _class_mask(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    selected: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    shape: tuple[int, int],
) -> tuple[np.ndarray, np.ndarray]:
    """Cellules atteintes par une classe, et l'altitude la plus haute de chacune."""
    highest = maximum_by_cell(x[selected], y[selected], z[selected], xmin, ymax, resolution, shape)
    return np.isfinite(highest), highest


def fit_plane(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> tuple[float, float, float, float]:
    """Ajuste ``z = a·x + b·y + c`` aux moindres carrés, centré pour rester conditionné.

    L'ajustement est repris une fois après rejet des points à plus de trois écarts-types.
    Le laser rebondit mal sur l'eau : quelques retours aberrants — un reflet, un oiseau, un
    tir qui traverse — suffisent sinon à faire basculer toute la nappe, et ils sont d'autant
    plus nuisibles ici que le plan porte l'altitude de l'ensemble de la surface.

    Renvoie les coefficients dans le repère centré, la constante, puis l'écart-type du
    résidu — seul indicateur permettant de dire si le plan décrit la surface ou la caricature.
    """
    origin_x, origin_y = float(x.mean()), float(y.mean())
    design = np.column_stack([x - origin_x, y - origin_y, np.ones(len(x))])
    coefficients, *_ = np.linalg.lstsq(design, z, rcond=None)
    residuals = z - design @ coefficients
    spread = float(residuals.std())
    kept = np.abs(residuals) <= 3 * spread if spread > 0 else np.ones(len(z), dtype=bool)
    # Un rejet massif signalerait que la surface n'est pas plane : mieux vaut alors garder
    # l'ajustement complet, que le résidu renvoyé permettra de juger.
    if kept.sum() >= max(3, 0.5 * len(z)) and not kept.all():
        coefficients, *_ = np.linalg.lstsq(design[kept], z[kept], rcond=None)
        residuals = z[kept] - design[kept] @ coefficients
    return (
        float(coefficients[0]),
        float(coefficients[1]),
        float(coefficients[2]),
        float(residuals.std()),
    )


def water_surface(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    classification: np.ndarray,
    within: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    shape: tuple[int, int],
) -> Nappe:
    """Nappe d'eau : emprise rasterisée de la classe 9, altitude prise sur un plan ajusté.

    L'altitude ne vient pas des cellules mais du plan : le laser rebondit mal sur l'eau et
    les rares retours d'une cellule isolée sont bien plus bruités que la surface elle-même.
    """
    selected = (classification == WATER_CLASS) & within
    if not selected.any():
        return Nappe(np.full(shape, np.nan))
    mask, _ = _class_mask(x, y, z, selected, xmin, ymax, resolution, shape)
    mask = close_mask(mask, MASK_CLOSING_PASSES)
    if mask.sum() < MINIMUM_CELLS:
        return Nappe(np.full(shape, np.nan))

    slope_x, slope_y, offset, residual = fit_plane(x[selected], y[selected], z[selected])
    origin_x, origin_y = float(x[selected].mean()), float(y[selected].mean())
    rows, columns = np.nonzero(mask)
    cell_x = xmin + (columns + 0.5) * resolution
    cell_y = ymax - (rows + 0.5) * resolution
    elevations = np.full(shape, np.nan)
    elevations[rows, columns] = (
        slope_x * (cell_x - origin_x) + slope_y * (cell_y - origin_y) + offset
    )
    slope = 100 * float(np.hypot(slope_x, slope_y))
    print(
        f"Eau : {int(mask.sum())} cellules, pente {slope:.2f} %, "
        f"résidu au plan {residual:.2f} m"
    )
    return Nappe(elevations)


def bridge_surface(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    classification: np.ndarray,
    within: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    shape: tuple[int, int],
) -> Nappe:
    """Tablier de pont : emprise et altitude rasterisées depuis la classe 17.

    Le tablier est dense et quasi plan ; son altitude peut donc venir directement des
    cellules, contrairement à l'eau. Les cellules comblées par la fermeture reprennent la
    médiane du tablier, faute de mesure propre.
    """
    selected = (classification == BRIDGE_CLASS) & within
    if not selected.any():
        return Nappe(np.full(shape, np.nan))
    mask, highest = _class_mask(x, y, z, selected, xmin, ymax, resolution, shape)
    closed = close_mask(mask, MASK_CLOSING_PASSES)
    if closed.sum() < MINIMUM_CELLS:
        return Nappe(np.full(shape, np.nan))

    elevations = np.full(shape, np.nan)
    elevations[mask] = highest[mask]
    filled = closed & ~mask
    if filled.any():
        elevations[filled] = float(np.median(highest[mask]))
    spread = float(np.nanmax(elevations) - np.nanmin(elevations))
    print(f"Pont : {int(closed.sum())} cellules, dénivelé du tablier {spread:.2f} m")
    return Nappe(elevations)


def _window_sum(values: np.ndarray, radius: int) -> np.ndarray:
    """Somme locale carrée, bornée à la grille.

    ``uniform_filter`` calcule la moyenne ; la somme s'en déduit par le nombre de cellules de
    la fenêtre. Le mode ``constant`` reproduit le comportement de l'image intégrale écrite ici
    auparavant : au bord, ce qui manque compte pour zéro, et non pour la valeur du bord.
    """
    if radius < 1:
        return values.astype(np.float64, copy=True)
    from scipy.ndimage import uniform_filter

    width = radius * 2 + 1
    return uniform_filter(
        values.astype(np.float64), size=width, mode="constant", cval=0.0
    ) * (width * width)


# Sous cette surface, une tache de strate basse est un résidu de classification et non un
# buisson : quelques cellules isolées au milieu d'un toit ou d'une route. Le seuil vaut en
# mètres carrés pour ne pas dépendre de la maille, qui change d'une emprise à l'autre.
MINIMUM_UNDERSTORY_PATCH_M2 = 4.0


def understory_blanket(
    understory: np.ndarray,
    terrain: np.ndarray,
    resolution: float,
    *,
    minimum_height: float,
    maximum_height: float,
    coverage: float,
    smoothing: float,
) -> Nappe:
    """Tapis de végétation basse et moyenne, tiré des classes LiDAR 3 et 4.

    Ces deux strates ne comptaient que dans le modèle de surface et l'occlusion : rien ne les
    montrait, alors que ce sont elles qui portent la garrigue, les ronces et le sous-bois
    cévenols. Le rendu est une nappe qui épouse le relief, et non des buissons individuels :
    le LiDAR aérien mesure ici une hauteur de couvert, pas des sujets qu'on pourrait
    dénombrer. Inventer des volumes séparés serait ajouter de la fiction à une mesure.

    ``maximum_height`` évite le double emploi avec les houppiers : au-delà, la cellule
    appartient à un arbre, que la végétation haute traite déjà pour son compte.
    """
    from skimage.morphology import remove_small_objects

    if understory.shape != terrain.shape:
        raise ValueError("understory.npy et terrain.npy ne partagent pas la même grille")
    if resolution <= 0:
        raise ValueError("La résolution de la strate arbustive doit être positive")
    if not 0.0 <= coverage <= 1.0:
        raise ValueError("UNDERSTORY_COVERAGE doit rester entre 0 et 1")
    if minimum_height < 0 or smoothing < 0:
        raise ValueError("Les hauteurs et le lissage de la strate ne peuvent pas être négatifs")
    if maximum_height <= minimum_height:
        raise ValueError("UNDERSTORY_MIN_HEIGHT_M doit rester sous VEGETATION_MIN_HEIGHT_M")

    covered = (
        np.isfinite(understory)
        & (understory >= minimum_height)
        & (understory < maximum_height)
    )
    # Le nettoyage précède la mesure de densité : sans lui, une poignée de cellules parasites
    # suffirait à faire lever un lambeau de tapis au milieu d'une toiture.
    minimum_cells = max(1, int(round(MINIMUM_UNDERSTORY_PATCH_M2 / (resolution * resolution))))
    covered = remove_small_objects(covered, min_size=minimum_cells)
    if not covered.any():
        return Nappe(np.full(understory.shape, np.nan))

    radius = max(0, int(round(smoothing / resolution)))
    covered_count = _window_sum(covered.astype(np.float64), radius)
    available_count = _window_sum(np.ones(understory.shape, dtype=np.float64), radius)
    dense = covered & (covered_count / available_count >= coverage)
    if not dense.any():
        return Nappe(np.full(understory.shape, np.nan))

    smoothed = np.divide(
        _window_sum(np.where(covered, understory, 0.0), radius),
        covered_count,
        out=np.zeros_like(terrain, dtype=np.float64),
        where=covered_count > 0,
    )
    elevations = np.full(understory.shape, np.nan)
    elevations[dense] = terrain[dense] + np.maximum(smoothed[dense], minimum_height)
    return Nappe(elevations)


def canopy_massif(
    canopy: np.ndarray,
    terrain: np.ndarray,
    resolution: float,
    *,
    coverage: float,
    minimum_height: float,
    smoothing: float,
) -> Nappe:
    """Nappe de couvert continu sous les proxys individuels de végétation."""
    if canopy.shape != terrain.shape:
        raise ValueError("canopy.npy et terrain.npy ne partagent pas la même grille")
    if resolution <= 0:
        raise ValueError("La résolution de la canopée doit être positive")
    if not 0.0 <= coverage <= 1.0:
        raise ValueError("CANOPY_MASSIF_COVERAGE doit rester entre 0 et 1")
    if minimum_height < 0 or smoothing < 0:
        raise ValueError("Les hauteurs et le lissage de la canopée ne peuvent pas être négatifs")

    radius = max(0, int(round(smoothing / resolution)))
    covered = np.isfinite(canopy) & (canopy >= minimum_height)
    covered_count = _window_sum(covered.astype(np.float64), radius)
    available_count = _window_sum(np.ones(canopy.shape, dtype=np.float64), radius)
    dense = (covered_count > 0) & (covered_count / available_count >= coverage)
    if not dense.any():
        return Nappe(np.full(canopy.shape, np.nan))

    top = terrain + np.where(covered, canopy, 0.0)
    smoothed = np.divide(
        _window_sum(np.where(covered, top, 0.0), radius),
        covered_count,
        out=terrain.astype(np.float64, copy=True),
        where=covered_count > 0,
    )
    elevations = np.full(canopy.shape, np.nan)
    elevations[dense] = np.maximum(smoothed[dense], terrain[dense])
    return Nappe(elevations)


def surface_triangles(
    elevations: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    centre: tuple[float, float],
    base_elevation: float,
    thickness: float = 0.0,
) -> list[list[tuple[float, float, float]]]:
    """Maille une nappe en quads par cellule, dans le repère GLB.

    Chaque cellule devient un quad indépendant plutôt qu'un maillage continu : une nappe
    trouée n'a pas de contour simple, et le gain d'un maillage partagé serait invisible sur
    quelques milliers de cellules.

    ``thickness`` ajoute une sous-face et des bords verticaux, ce qui transforme la nappe en
    volume — nécessaire pour un tablier, qu'on voit par en dessous depuis la rivière, inutile
    pour une surface d'eau.
    """
    centre_x, centre_y = centre
    half = resolution / 2
    triangles: list[list[tuple[float, float, float]]] = []
    rows, columns = np.nonzero(np.isfinite(elevations))
    for row, column in zip(rows.tolist(), columns.tolist()):
        top = float(elevations[row, column]) - base_elevation
        east = xmin + (column + 0.5) * resolution - centre_x
        south = centre_y - (ymax - (row + 0.5) * resolution)
        west, right = east - half, east + half
        north, below = south - half, south + half
        corners = (
            (west, top, north),
            (right, top, north),
            (right, top, below),
            (west, top, below),
        )
        # Vu de dessus, X vers l'est et Z vers le sud : ce parcours laisse la normale vers
        # le haut, sans quoi la nappe disparaîtrait en rendu simple face.
        triangles.append([corners[0], corners[3], corners[2]])
        triangles.append([corners[0], corners[2], corners[1]])
        if thickness <= 0:
            continue
        low = tuple((point[0], top - thickness, point[2]) for point in corners)
        triangles.append([low[0], low[1], low[2]])
        triangles.append([low[0], low[2], low[3]])
        for first, second in zip(range(4), (1, 2, 3, 0)):
            triangles.append([corners[first], corners[second], low[second]])
            triangles.append([corners[first], low[second], low[first]])
    return triangles


def load_nappe(path) -> Nappe | None:
    """Relit une nappe enregistrée, ou ``None`` si l'étape terrain est antérieure."""
    if not path.is_file():
        return None
    return Nappe(np.load(path))
