"""Végétation haute : proxys d'arbres reconstruits depuis le modèle de hauteur de canopée.

Plus d'un quart de l'emprise est sous couvert boisé et n'existait pas en 3D : les arbres
n'étaient que de la peinture plate sur le terrain, ce qui trahit le rendu plus sûrement que
n'importe quel défaut de toiture.

L'approche reste délibérément sobre : hauteur de canopée, maxima locaux pour les cimes,
segmentation des houppiers par ligne de partage des eaux, puis un volume simple par arbre.
BD Forêt V2 ne pilote qu'un profil feuillu, conifère ou mixte à l'échelle de sa plage
cartographiée. Pas de reconstruction botanique individuelle ni de panneau orienté caméra —
à 200 m l'enjeu est la présence, pas le réalisme botanique.

Le houppier se mesurait auparavant par retombée d'un profil radial autour de la cime. Ce
critère est juste sur un arbre isolé et faux en couvert continu : entre deux sujets jointifs
la canopée ne retombe jamais, le profil court jusqu'au plafond, et ``VEGETATION_MAX_CROWN_M``
tranchait pour près de la moitié des arbres — la mesure était alors celle du réglage, pas
celle de la donnée. La ligne de partage des eaux résout exactement ce cas : les cimes servent
de marqueurs, le relief est la canopée retournée, et deux houppiers voisins se partagent la
vallée qui les sépare au lieu de saturer chacun de son côté.
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
# le critère le plus stable sur un modèle de hauteur bruité. Il borne aussi le bassin de la
# ligne de partage des eaux, qui sans cela s'étendrait jusqu'au pied du couvert.
CROWN_HEIGHT_RATIO = 0.5
# Aplatissement maximal d'un houppier segmenté, en rapport du petit axe au grand. Une couronne
# réelle est ovale, jamais une lame : sous ce seuil, la région décrit une trouée entre deux
# arbres ou une haie prise pour un sujet, et l'ovalité mesurée doit céder devant le garde-fou.
MINIMUM_CROWN_RATIO = 0.35
FOREST_WFS_URL = "https://data.geopf.fr/wfs/ows"
FOREST_WFS_LAYER = "LANDCOVER.FORESTINVENTORY.V2:formation_vegetale"
# Second référentiel, interrogé après BD Forêt. Celle-ci ne cartographie que des plages d'au
# moins 5 000 m² et ignore donc tout ce qui n'est pas un massif : la BD TOPO décrit à l'inverse
# haies, landes ligneuses, bois et forêts ouvertes, à la parcelle. C'est cette granularité-là
# qu'il faut pour typer la végétation d'abord et le pourtour d'un village ensuite.
#
# Le thème Végétation harmonisé de BD France (`IGNF_BD-FRANCE-TOPO-VEGETATION`) serait le
# candidat naturel : il figure au catalogue WFS de la Géoplateforme, mais n'y renvoie aucune
# entité — vérifié sur Valleraugue, l'Hort-de-Dieu et Besançon. La BD TOPO le remplace tant
# qu'il reste vide.
LANDCOVER_WFS_LAYER = "BDTOPO_V3:zone_de_vegetation"
LAMBERT_93 = "EPSG:2154"


@dataclass(frozen=True)
class Tree:
    """Un arbre proxy, en Lambert-93 et en mètres.

    ``crown`` est le rayon du disque de même aire que le houppier segmenté. ``ratio`` et
    ``angle`` décrivent son ellipse — rapport des axes et orientation du grand axe, en
    radians depuis l'est. Les trois sont absents d'un ``trees.json`` antérieur à la
    segmentation : la silhouette retombe alors sur le tirage pseudo-aléatoire d'origine.
    """

    x: float
    y: float
    ground: float
    height: float
    crown: float
    foliage: str = "generic"
    essence: str | None = None
    crown_area: float | None = None
    crown_ratio: float | None = None
    crown_angle: float | None = None

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
        if self.crown_area is not None:
            result["crownArea"] = round(self.crown_area, 2)
        if self.crown_ratio is not None:
            result["crownRatio"] = round(self.crown_ratio, 3)
        if self.crown_angle is not None:
            result["crownAngle"] = round(self.crown_angle, 3)
        return result


def _foliage_kind(essence: object) -> str:
    label = str(essence or "").casefold()
    if "mixte" in label:
        return "mixed"
    if "conif" in label or "résine" in label:
        return "conifer"
    if (
        "feuill" in label
        or "châtaign" in label
        or "chêne" in label
        or "peupl" in label
        # Natures de la BD TOPO : une haie et un verger sont des feuillus sans exception
        # utile ici. « Bois », « Forêt ouverte » et « Lande ligneuse » n'indiquent en
        # revanche aucune essence, et gardent donc le profil générique.
        or "haie" in label
        or "verger" in label
    ):
        return "deciduous"
    return "generic"


def _formation_label(properties: dict) -> str:
    """Nature d'une formation, quel que soit le référentiel qui la décrit.

    BD Forêt nomme son attribut ``essence`` ou ``tfv``, la BD TOPO le nomme ``nature``.
    Les deux couches se lisent par le même chemin, et seul le nom du champ change.
    """
    for champ in ("essence", "tfv", "nature"):
        valeur = str(properties.get(champ) or "").strip()
        if valeur:
            return valeur
    return ""


def classify_forest_types(trees: list[Tree], payload: dict) -> list[Tree]:
    """Affecte à chaque cime la nature de la formation végétale qui la contient.

    L'appariement passe par une jointure spatiale indexée. Écrit à la main, le test
    point-dans-polygone comparait chaque arbre à chaque formation : sur une emprise de
    500 m, quelques centaines de cimes contre autant de polygones, le coût devenait celui
    du produit des deux. Il interdisait surtout d'interroger un second référentiel, alors
    que c'est ce qu'il faut pour typer autre chose que des plages forestières.

    Une cime déjà typée n'est jamais reclassée : le second recours ne sert qu'à ce que le
    premier a laissé générique.
    """
    import geopandas as gpd
    from shapely.geometry import Point, shape

    formations = [
        (shape(feature["geometry"]), _formation_label(feature.get("properties") or {}))
        for feature in payload.get("features", [])
        if feature.get("geometry") and _formation_label(feature.get("properties") or {})
    ]
    if not formations or not trees:
        return trees

    cimes = gpd.GeoDataFrame(
        {"rang": range(len(trees))},
        geometry=[Point(tree.x, tree.y) for tree in trees],
        crs=LAMBERT_93,
    )
    plages = gpd.GeoDataFrame(
        {"label": [label for _, label in formations]},
        geometry=[geometrie for geometrie, _ in formations],
        crs=LAMBERT_93,
    )
    jointure = cimes.sjoin(plages, how="inner", predicate="within")
    # Deux formations superposées produiraient deux lignes pour la même cime : la première
    # tranche, comme le faisait le parcours séquentiel qu'elle remplace.
    labels = dict(
        zip(
            jointure["rang"].tolist(),
            jointure["label"].tolist(),
        )
    )

    classified = []
    for rang, tree in enumerate(trees):
        label = labels.get(rang)
        if label and tree.foliage == "generic":
            classified.append(replace(tree, foliage=_foliage_kind(label), essence=label))
        else:
            classified.append(tree)
    return classified


def download_forest_types(config: PocConfig, layer: str = FOREST_WFS_LAYER) -> dict:
    """Récupère les seules formations qui croisent l'emprise de terrain."""
    xmin, ymin, xmax, ymax = config.terrain_bbox
    crs = "urn:ogc:def:crs:EPSG::2154"
    params = {
        "SERVICE": "WFS",
        "VERSION": "2.0.0",
        "REQUEST": "GetFeature",
        "TYPENAMES": layer,
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


def _crown_ellipse(region_rows: np.ndarray, region_columns: np.ndarray) -> tuple[float, float]:
    """Aplatissement et orientation d'un houppier, par les moments d'ordre deux de sa région.

    Les axes principaux de la couronne sortent des vecteurs propres de la covariance de ses
    cellules. C'est la mesure que le tirage pseudo-aléatoire d'origine remplaçait faute de
    segmentation : une couronne réelle est ovale, et son grand axe suit la lumière ou le
    voisin qui l'a contrainte.

    Renvoie le rapport du petit axe au grand — borné, car une région en lame décrit une
    trouée et non un arbre — et l'angle du grand axe, en radians depuis l'est.

    Les coordonnées entrent en lignes et colonnes de la grille : la ligne croît vers le sud,
    la colonne vers l'est. La conversion en mètres est isotrope et n'a donc aucun effet sur
    les directions ; elle est omise.
    """
    count = region_rows.size
    if count < 2:
        return 1.0, 0.0
    south = region_rows - region_rows.mean()
    east = region_columns - region_columns.mean()
    covariance = np.array(
        [
            [float((east * east).sum()), float((east * south).sum())],
            [float((east * south).sum()), float((south * south).sum())],
        ]
    ) / count
    # `eigh` suffit et ordonne ses valeurs propres croissantes : la matrice est symétrique
    # par construction. Les valeurs propres sont les variances le long des axes principaux.
    values, vectors = np.linalg.eigh(covariance)
    if values[1] <= 1e-12:
        return 1.0, 0.0
    ratio = math.sqrt(max(values[0], 0.0) / values[1])
    major = vectors[:, 1]
    return max(ratio, MINIMUM_CROWN_RATIO), math.atan2(float(major[1]), float(major[0]))


def _segment_crowns(
    canopy: np.ndarray,
    peaks: np.ndarray,
    minimum_height: float,
    resolution: float,
    maximum_crown: float,
) -> dict[int, tuple[float, float, float]]:
    """Segmente les houppiers par ligne de partage des eaux, une région par cime.

    Le relief soumis à l'algorithme est la canopée retournée : chaque cime devient le fond
    d'un bassin, et la crête qui sépare deux bassins tombe dans le creux entre deux arbres —
    précisément là où le profil radial ne retombait jamais.

    Deux garde-fous bornent les bassins. Le masque écarte ce qui n'est pas de la canopée, pour
    que l'eau ne s'écoule ni sur le sol nu ni sur les toitures. Le rayon maximal la borne
    ensuite : sans lui, un arbre en lisière annexerait tout le versant qu'aucun voisin ne lui
    dispute.

    Renvoie, par étiquette de cime, l'aire du houppier en mètres carrés, l'aplatissement de
    son ellipse et l'orientation de son grand axe.
    """
    from skimage.segmentation import watershed

    reach = max(1, int(round(maximum_crown / resolution)))
    markers = np.zeros(canopy.shape, dtype=np.int32)
    for label, (row, column) in enumerate(peaks, start=1):
        markers[row, column] = label

    within_reach = np.zeros(canopy.shape, dtype=bool)
    for row, column in peaks:
        first, last = max(0, row - reach), min(canopy.shape[0], row + reach + 1)
        left, right = max(0, column - reach), min(canopy.shape[1], column + reach + 1)
        within_reach[first:last, left:right] = True

    labels = watershed(-canopy, markers, mask=(canopy >= minimum_height) & within_reach)

    cell_area = resolution * resolution
    shapes: dict[int, tuple[float, float, float]] = {}
    for label, (row, column) in enumerate(peaks, start=1):
        rows, columns = np.nonzero(labels == label)
        if rows.size == 0:
            continue
        ratio, angle = _crown_ellipse(rows.astype(np.float64), columns.astype(np.float64))
        shapes[label] = (rows.size * cell_area, ratio, angle)
    return shapes


def _peak_candidates(
    filled: np.ndarray, minimum_height: float, reach: int
) -> list[tuple[int, int]]:
    """Cimes retenues, parcourues du plus haut maximum local au plus bas.

    Les maxima se suppriment mutuellement dans la fenêtre de détection : sans cela, un
    houppier large produirait une grappe de doublons, et la segmentation lui découperait
    autant de bassins minuscules.
    """
    from scipy.ndimage import maximum_filter as ndimage_maximum_filter

    highest = ndimage_maximum_filter(filled, size=2 * reach + 1, mode="nearest")
    candidates = np.argwhere((filled >= minimum_height) & (filled >= highest))
    if candidates.size == 0:
        return []
    order = np.argsort(-filled[candidates[:, 0], candidates[:, 1]])
    taken = np.zeros(filled.shape, dtype=bool)
    peaks: list[tuple[int, int]] = []
    for row, column in candidates[order]:
        first, last = max(0, row - reach), min(filled.shape[0], row + reach + 1)
        left, right = max(0, column - reach), min(filled.shape[1], column + reach + 1)
        if taken[first:last, left:right].any():
            continue
        taken[row, column] = True
        peaks.append((int(row), int(column)))
    return peaks


def detect_trees(
    config: PocConfig,
    canopy: np.ndarray,
    terrain: np.ndarray,
) -> list[Tree]:
    """Retient une cime par maximum local du modèle de hauteur de canopée, puis la dimensionne.

    ``VEGETATION_CROWN_SEGMENTATION`` décide de la mesure du houppier : la ligne de partage
    des eaux par défaut, le profil radial des exécutions antérieures sinon. Les deux restent
    disponibles parce que la comparaison sur une emprise réelle est le seul moyen de juger un
    changement de ce genre.
    """
    resolution = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
    minimum_height = config.get_float("VEGETATION_MIN_HEIGHT_M", 4.0)
    window_m = config.get_float("VEGETATION_PEAK_WINDOW_M", 5.0)
    maximum_crown = config.get_float("VEGETATION_MAX_CROWN_M", 6.4)
    segmented = config.get_bool("VEGETATION_CROWN_SEGMENTATION", True)
    if minimum_height <= 0 or window_m <= 0:
        raise ValueError("VEGETATION_MIN_HEIGHT_M et VEGETATION_PEAK_WINDOW_M doivent être positifs")

    xmin, _, _, ymax = config.terrain_bbox
    filled = np.where(np.isfinite(canopy), canopy, 0.0)
    reach = max(1, int(round(window_m / (2 * resolution))))
    peaks = _peak_candidates(filled, minimum_height, reach)
    if not peaks:
        return []

    shapes = (
        _segment_crowns(filled, peaks, minimum_height, resolution, maximum_crown)
        if segmented
        else {}
    )
    trees: list[Tree] = []
    for label, (row, column) in enumerate(peaks, start=1):
        height = float(filled[row, column])
        area, ratio, angle = shapes.get(label, (None, None, None))
        if area is None:
            radius = _crown_radius(canopy, row, column, height, resolution, maximum_crown)
        else:
            # Le rayon est celui du disque de même aire : c'est la grandeur qui survit à une
            # couronne non circulaire, et l'ovalité la restitue ensuite sans toucher au volume.
            radius = math.sqrt(area / math.pi)
        trees.append(
            Tree(
                x=xmin + (column + 0.5) * resolution,
                y=ymax - (row + 0.5) * resolution,
                ground=float(terrain[row, column]),
                height=height,
                crown=min(max(radius, MINIMUM_CROWN_RADIUS_M), maximum_crown),
                crown_area=area,
                crown_ratio=ratio,
                crown_angle=angle,
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
            # Absents d'un `trees.json` antérieur à la segmentation : la silhouette retombe
            # alors sur le tirage stable, et rien n'oblige à réassembler la scène.
            float(entry["crownArea"]) if entry.get("crownArea") is not None else None,
            float(entry["crownRatio"]) if entry.get("crownRatio") is not None else None,
            float(entry["crownAngle"]) if entry.get("crownAngle") is not None else None,
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

    landcover_source = None
    if trees and config.get_bool("VEGETATION_LANDCOVER", True):
        # Second recours, sur ce que BD Forêt a laissé générique : ses plages de 5 000 m²
        # ignorent les haies et les lisières, qui sont l'essentiel du pourtour d'un village.
        try:
            landcover_payload = download_forest_types(config, LANDCOVER_WFS_LAYER)
            before = sum(1 for tree in trees if tree.foliage == "generic")
            trees = classify_forest_types(trees, landcover_payload)
            after = sum(1 for tree in trees if tree.foliage == "generic")
            landcover_source = {
                "url": FOREST_WFS_URL,
                "layer": LANDCOVER_WFS_LAYER,
                "features": len(landcover_payload["features"]),
                "typedTrees": before - after,
            }
        except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
            print(f"AVERTISSEMENT : typologie BD TOPO indisponible ({error}).")

    destination = run_dir / "trees.json"
    covered = float(np.isfinite(canopy).mean())
    foliage_counts: dict[str, int] = {}
    for tree in trees:
        foliage_counts[tree.foliage] = foliage_counts.get(tree.foliage, 0) + 1
    maximum_crown = config.get_float("VEGETATION_MAX_CROWN_M", 6.4)
    # Le nombre d'arbres au plafond est l'indicateur qui juge la mesure du houppier : tant
    # qu'il est élevé, c'est le réglage qui décide de la largeur des couronnes et non la
    # canopée. Il valait 153 sur 358 au profil radial, sur l'emprise 200 m de référence.
    capped = sum(1 for tree in trees if tree.crown >= maximum_crown - 1e-6)
    metadata = {
        "count": len(trees),
        "canopyCoverage": round(covered, 3),
        "minimumHeightM": config.get_float("VEGETATION_MIN_HEIGHT_M", 4.0),
        "crownSegmentation": config.get_bool("VEGETATION_CROWN_SEGMENTATION", True),
        "crownCapped": capped,
        "foliage": dict(sorted(foliage_counts.items())),
        "trees": [tree.as_json() for tree in trees],
    }
    if forest_source:
        metadata["forestSource"] = forest_source
    if landcover_source:
        metadata["landcoverSource"] = landcover_source
    destination.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if trees:
        heights = sorted(tree.height for tree in trees)
        typed = len(trees) - foliage_counts.get("generic", 0)
        par_bd_topo = landcover_source["typedTrees"] if landcover_source else 0
        print(
            f"Végétation : {len(trees)} arbres, hauteur médiane "
            f"{heights[len(heights) // 2]:.1f} m, maximum {heights[-1]:.1f} m "
            f"({covered:.0%} de l'emprise sous canopée, {typed} typés "
            f"dont {par_bd_topo} par la BD TOPO)"
        )
        radii = sorted(tree.crown for tree in trees)
        mesure = "segmentés" if metadata["crownSegmentation"] else "par profil radial"
        print(
            f"Houppiers {mesure} : rayon médian {radii[len(radii) // 2]:.1f} m, "
            f"{capped} arbres au plafond de {maximum_crown:.1f} m "
            f"({capped / len(trees):.0%})"
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
    """Rotation et ovalité du houppier : la mesure quand elle existe, un tirage stable sinon.

    La segmentation donne l'ellipse réelle de chaque couronne. Tant qu'elle manquait, la
    silhouette venait d'un CRC de la position — assez pour rompre l'alignement d'un solide
    identique recopié des centaines de fois, mais sans rapport avec l'arbre. Le repli subsiste
    pour un ``trees.json`` antérieur, et pour les scènes qui ont désactivé la segmentation.

    ``ovality`` multiplie le demi-axe est et divise le demi-axe sud : son produit vaut un, et
    l'aire du houppier reste donc celle qui a été mesurée, quelle que soit sa forme.
    """
    if tree.crown_ratio is not None and tree.crown_angle is not None:
        return tree.crown_angle, 1.0 / math.sqrt(max(tree.crown_ratio, MINIMUM_CROWN_RATIO))
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
