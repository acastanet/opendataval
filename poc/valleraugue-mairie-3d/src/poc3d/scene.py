"""Atelier de construction d'une scène : d'un point sur une carte à une configuration.

Jusqu'ici, ajouter une emprise demandait de projeter le point à la main, de recopier un
`.conf` existant, de deviner la dalle LiDAR et de retrouver la commande amont dans la
documentation. Quatre gestes, dont trois silencieux en cas d'erreur.

Ce module en fait une fonction. `plan_scene` calcule tout ce qu'une scène exige — emprise
Lambert-93, emprise du terrain, dalles LiDAR à mettre en cache, maille, taille de
l'orthophotographie, commande amont — sans rien écrire. `write_scene` matérialise ensuite
la configuration. La séparation est délibérée : une interface de construction affiche le
plan, le fait valider, puis seulement l'écrit. `ScenePlan.as_dict` est le contrat entre les
deux, et la commande `poc.py scene --json` le sert tel quel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import json
import re
import unicodedata

from .geodesy import (
    bbox_centre,
    bbox_corners,
    lambert93_to_wgs84,
    lidar_tiles,
    square_bbox,
    wgs84_to_lambert93,
)


# Marge portée autour de `POC_BBOX` pour le terrain et l'orthophotographie. Les bâtiments
# reconstruits par Roofer débordent l'emprise demandée ; sans cette marge, ceux de bordure
# flottent au-delà du terrain.
DEFAULT_TERRAIN_MARGIN_M = 15.0

# Au-delà, la Géoplateforme refuse la requête WMS.
MAX_ORTHO_SIZE_PX = 4096
MIN_ORTHO_SIZE_PX = 1024
# Résolution visée au sol. 15 cm/pixel est le point où la texture cesse d'apporter du détail
# au regard de la maille du terrain ; en deçà, on paie des pixels pour rien.
TARGET_ORTHO_RESOLUTION_M = 0.15

# Maille du terrain. À 0,5 m la donnée porte encore trois points sol par cellule au centre
# d'un village ; sur une grande emprise, le nombre de mailles croît en carré et la scène
# devient intransportable bien avant que le détail ne serve.
FINE_TERRAIN_RESOLUTION_M = 0.5
COARSE_TERRAIN_RESOLUTION_M = 1.0
FINE_RESOLUTION_MAX_SIDE_M = 300.0

# Ordre de grandeur mesuré sur les scènes réelles : 23 Mo pour 211 600 mailles (emprise
# 200 m) et 57,5 Mo pour 396 900 (emprise 600 m), bâtiments compris. La dispersion vient de
# la densité de bâti, que rien ne permet de connaître avant l'exécution amont.
GLB_BYTES_PER_CELL = 130
# Une dalle LiDAR HD complète pèse environ 300 Mo.
LIDAR_TILE_MB = 300

# Au-delà, la scène dépasse la centaine de mégaoctets : chargeable en local, pénible en ligne.
CELLS_WARNING_THRESHOLD = 800_000

SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(label: str) -> str:
    """Identifiant de scène tiré d'un intitulé : sert de nom de `.conf` et de dossier servi.

    Les accents sont réduits et non supprimés — « Notre-Dame-de-la-Rouvière » doit rendre
    `notre-dame-de-la-rouviere` et non `notre-dame-de-la-rouvire`.
    """
    normalised = unicodedata.normalize("NFKD", label)
    ascii_only = "".join(char for char in normalised if not unicodedata.combining(char))
    slug = SLUG_RE.sub("-", ascii_only.lower()).strip("-")
    if not slug:
        raise ValueError(f"Intitulé sans identifiant exploitable : {label!r}")
    return slug


def default_terrain_resolution(side: float) -> float:
    return (
        FINE_TERRAIN_RESOLUTION_M
        if side <= FINE_RESOLUTION_MAX_SIDE_M
        else COARSE_TERRAIN_RESOLUTION_M
    )


def default_ortho_size(terrain_side: float) -> int:
    """Plus petite puissance de deux tenant la résolution visée, dans les bornes du service."""
    size = MIN_ORTHO_SIZE_PX
    while size < MAX_ORTHO_SIZE_PX and terrain_side / size > TARGET_ORTHO_RESOLUTION_M:
        size *= 2
    return size


@dataclass(frozen=True)
class SceneRequest:
    """Ce qu'une interface de construction demande à l'utilisateur.

    Seuls le point, le côté et le titre sont obligatoires ; le reste se déduit et n'existe
    que pour permettre de forcer une valeur en connaissance de cause.
    """

    latitude: float
    longitude: float
    side_m: float
    title: str
    subtitle: str = "IGN LiDAR HD"
    identifier: str | None = None
    centre_label: str = "Point central"
    terrain_resolution_m: float | None = None
    terrain_margin_m: float = DEFAULT_TERRAIN_MARGIN_M
    ortho_size_px: int | None = None
    output_dir: str | None = None

    def resolved_identifier(self) -> str:
        return self.identifier or f"{slugify(self.title)}-{round(self.side_m)}m"


@dataclass(frozen=True)
class ScenePlan:
    """Tout ce que la scène implique, calculé et vérifié, mais pas encore écrit."""

    request: SceneRequest
    identifier: str
    bbox: tuple[float, float, float, float]
    terrain_bbox: tuple[float, float, float, float]
    centre_lambert93: tuple[float, float]
    centre_wgs84: tuple[float, float]
    terrain_resolution_m: float
    ortho_size_px: int
    output_dir: str
    tiles: list[str]
    warnings: list[str] = field(default_factory=list)

    @property
    def terrain_side_m(self) -> float:
        xmin, _, xmax, _ = self.terrain_bbox
        return xmax - xmin

    @property
    def terrain_cells(self) -> int:
        return round((self.terrain_side_m / self.terrain_resolution_m) ** 2)

    @property
    def ortho_resolution_m(self) -> float:
        return self.terrain_side_m / self.ortho_size_px

    @property
    def estimated_glb_mb(self) -> float:
        return self.terrain_cells * GLB_BYTES_PER_CELL / 1_048_576

    @property
    def config_path(self) -> str:
        return f"config/{self.identifier}.conf"

    def creation_command(self) -> str:
        """Commande `poc.py scene` reproduisant exactement cette configuration.

        Elle est recopiée en tête du `.conf` : une emprise doit pouvoir être refaite à
        l'identique un an plus tard, y compris quand les valeurs par défaut du module ont
        changé entre-temps. Les options déduites sont donc écrites, pas omises.
        """
        request = self.request
        parts = [
            "poc.py scene",
            f"--lat {request.latitude:.6f}",
            f"--lon {request.longitude:.6f}",
            f"--side {request.side_m:g}",
            f'--title "{request.title}"',
            f'--subtitle "{request.subtitle}"',
            f'--centre-label "{request.centre_label}"',
            f"--id {self.identifier}",
            f"--resolution {self.terrain_resolution_m:g}",
            f"--margin {request.terrain_margin_m:g}",
            f"--ortho-px {self.ortho_size_px}",
            f'--output-dir "{self.output_dir}"',
            "--write",
        ]
        return " ".join(parts)

    def upstream_command(self) -> str:
        """Commande de l'étape amont LiDAR + Roofer, prête à coller en Git Bash.

        `--buffer` reprend `TERRAIN_MARGIN_M` : à l'égalité exacte, la validation passe avec
        une marge nulle sur les bords que le bâti ne prolonge pas. C'est juste, mais sans
        réserve — la documentation conseille deux ou trois mètres de plus.
        """
        xmin, ymin, xmax, ymax = self.bbox
        return (
            "MSYS2_ARG_CONV_EXCL='*' bash .work-python/roofer-with-ignf-datasets/run.sh \\\n"
            f"  --bbox {xmin:.0f} {ymin:.0f} {xmax:.0f} {ymax:.0f} \\\n"
            f"  --buffer {round(self.request.terrain_margin_m):g} \\\n"
            f"  --out {self.output_dir.lstrip('./')}"
        )

    def tile_urls(self) -> list[str]:
        return [
            "https://data.geopf.fr/telechargement/download/LiDARHD-NUALID/"
            f"NUALHD_1-0__LAZ_LAMB93_MP_2024-12-13/{tile}_PTS_LAMB93_IGN69.copc.laz"
            for tile in self.tiles
        ]

    def as_dict(self) -> dict[str, object]:
        """Contrat lisible par une interface de construction ou par un autre outil."""
        corners = bbox_corners(self.bbox)
        return {
            "id": self.identifier,
            "title": self.request.title,
            "subtitle": self.request.subtitle,
            "centreLabel": self.request.centre_label,
            "centre": {
                "lambert93": list(self.centre_lambert93),
                "wgs84": list(self.centre_wgs84),
            },
            "sideM": self.request.side_m,
            "bbox": list(self.bbox),
            "terrainBbox": list(self.terrain_bbox),
            "terrainMarginM": self.request.terrain_margin_m,
            "terrainResolutionM": self.terrain_resolution_m,
            "terrainCells": self.terrain_cells,
            "orthoSizePx": self.ortho_size_px,
            "orthoResolutionM": round(self.ortho_resolution_m, 4),
            "outputDir": self.output_dir,
            "configPath": self.config_path,
            "footprintWgs84": corners.as_ring(),
            "lidarTiles": self.tiles,
            "lidarTileUrls": self.tile_urls(),
            "estimates": {
                "glbMb": round(self.estimated_glb_mb, 1),
                "lidarDownloadMb": len(self.tiles) * LIDAR_TILE_MB,
            },
            "creationCommand": self.creation_command(),
            "upstreamCommand": self.upstream_command(),
            "warnings": list(self.warnings),
        }


def plan_scene(request: SceneRequest) -> ScenePlan:
    """Calcule une scène complète sans rien écrire sur le disque."""
    easting, northing = wgs84_to_lambert93(request.longitude, request.latitude)
    bbox = square_bbox(easting, northing, request.side_m)
    margin = request.terrain_margin_m
    if margin < 0:
        raise ValueError("La marge du terrain ne peut pas être négative")
    xmin, ymin, xmax, ymax = bbox
    terrain_bbox = (xmin - margin, ymin - margin, xmax + margin, ymax + margin)
    resolution = request.terrain_resolution_m or default_terrain_resolution(request.side_m)
    if resolution <= 0:
        raise ValueError("La maille du terrain doit être strictement positive")
    terrain_side = terrain_bbox[2] - terrain_bbox[0]
    ortho_size = request.ortho_size_px or default_ortho_size(terrain_side)
    if not MIN_ORTHO_SIZE_PX <= ortho_size <= MAX_ORTHO_SIZE_PX:
        raise ValueError(
            f"ORTHO_SIZE_PX doit rester entre {MIN_ORTHO_SIZE_PX} et {MAX_ORTHO_SIZE_PX} pixels"
        )
    identifier = request.resolved_identifier()
    plan = ScenePlan(
        request=request,
        identifier=identifier,
        bbox=bbox,
        terrain_bbox=terrain_bbox,
        centre_lambert93=bbox_centre(bbox),
        centre_wgs84=lambert93_to_wgs84(*bbox_centre(bbox)),
        terrain_resolution_m=resolution,
        ortho_size_px=ortho_size,
        output_dir=request.output_dir or f"./output-{identifier}",
        tiles=lidar_tiles(terrain_bbox),
        warnings=[],
    )
    plan.warnings.extend(_review(plan))
    return plan


def _review(plan: ScenePlan) -> list[str]:
    """Ce qu'une interface doit montrer avant de laisser lancer une exécution.

    Aucun de ces points n'est bloquant : ils coûtent du temps ou de la place, pas la
    justesse du résultat. Les vraies erreurs lèvent une exception dans `plan_scene`.
    """
    notes: list[str] = []
    if len(plan.tiles) > 1:
        notes.append(
            f"{len(plan.tiles)} dalles LiDAR HD à mettre en cache "
            f"(~{len(plan.tiles) * LIDAR_TILE_MB} Mo) : {', '.join(plan.tiles)}."
        )
    if plan.terrain_cells > CELLS_WARNING_THRESHOLD:
        notes.append(
            f"{plan.terrain_cells:,} mailles de terrain".replace(",", " ")
            + f" : scène estimée à {plan.estimated_glb_mb:.0f} Mo. "
            "Élargir la maille du terrain allège la scène sans perte visible à cette distance."
        )
    if plan.ortho_size_px >= MAX_ORTHO_SIZE_PX and plan.ortho_resolution_m > 0.2:
        notes.append(
            f"Orthophotographie plafonnée à {MAX_ORTHO_SIZE_PX} px, "
            f"soit {plan.ortho_resolution_m * 100:.0f} cm/pixel : "
            "la Géoplateforme ne sert pas plus grand sur une seule requête."
        )
    return notes


def _configuration_text(plan: ScenePlan) -> str:
    """Rend le `.conf` de la scène, commentaires compris.

    Le gabarit reprend les réglages de traitement des configurations de référence : ils sont
    le fruit de mesures faites sur le site, et les redécouvrir emprise par emprise n'aurait
    pas de sens. Seuls l'identité, l'emprise, la maille et la taille de l'orthophoto varient.
    """
    xmin, ymin, xmax, ymax = plan.bbox
    side = round(plan.request.side_m)
    centre_x, centre_y = plan.centre_lambert93
    longitude, latitude = plan.centre_wgs84
    tiles = ", ".join(plan.tiles)
    return f"""# Scène « {plan.request.title} » — {side} × {side} m.
#
# Généré par :
#   {plan.creation_command()}
# Retoucher ce fichier à la main est prévu ; le régénérer écrase les retouches.
#
# Centre : {latitude:.6f}, {longitude:.6f} en WGS84, soit {centre_x:.0f}, {centre_y:.0f} en Lambert-93.
# Dalles LiDAR HD couvrant le terrain : {tiles}.
#
# L'emprise reste carrée à dessein. La requête WMS l'est, et toute la calibration de
# l'orthophotographie raisonne en pixels carrés : sur une bbox rectangulaire, le masque bâti
# déborderait du rapport d'aspect et le recalage rendrait un chiffre faux sans rien signaler.

# Identité de la scène : titre du visualiseur, surtitre de provenance et libellé du point de
# vue centré. Ces trois valeurs alimentent le sélecteur de scènes et l'en-tête de la page.
SCENE_TITLE="{plan.request.title}"
SCENE_SUBTITLE="{plan.request.subtitle}"
SCENE_CENTRE_LABEL="{plan.request.centre_label}"
# Point de référence en WGS84, conservé pour la traçabilité : le pipeline travaille en
# Lambert-93 et ne le relit pas.
SCENE_CENTRE_WGS84="{latitude:.6f} {longitude:.6f}"

POC_BBOX="{xmin:.0f} {ymin:.0f} {xmax:.0f} {ymax:.0f}"
EXPECTED_WIDTH_M={side}
EXPECTED_HEIGHT_M={side}
HTTP_USER_AGENT="OpenDataVdA-POC/2.0"
# Maille du terrain. À 0,5 m la donnée porte environ trois points sol par cellule au centre
# d'un village et le 95e centile du résidu chute de moitié sur les ruptures de pente —
# terrasses et murs de soutènement. Au-delà de 300 m de côté, le nombre de mailles croît en
# carré : la maille métrique évite une scène intransportable pour un détail invisible à
# cette distance de vue.
TERRAIN_RESOLUTION_M={plan.terrain_resolution_m:g}
TERRAIN_MARGIN_M={plan.request.terrain_margin_m:g}
TERRAIN_BLEND_M=3
# Profondeur de la tranche sous le terrain qu'elle borde, et non jusqu'à une altitude
# commune : 6 m suffisent à fermer la nappe quel que soit le dénivelé de l'emprise.
TERRAIN_EDGE_SKIRT_M=6
# Nuage LiDAR témoin séparé du modèle : chargé uniquement quand l'utilisateur choisit la
# vue « Nuage source ». Le plafond limite le poids web, et source-points.json donne les
# effectifs avant/après ainsi que le SHA-256 du LAZ.
SOURCE_POINTS=1
SOURCE_POINT_LIMIT=750000
# Pas de la grille de décimation. Un point est retenu par voxel, ce qui répartit la densité
# dans le volume au lieu de la prendre dans l'ordre du fichier : à budget de points égal, une
# façade se lit comme une surface et non comme une grappe. La grille s'élargit d'elle-même
# tant que le plafond n'est pas tenu, ce qui rend le réglage valable quelle que soit
# l'emprise. Mettre 0 rétablit l'échantillonnage stratifié par classe.
SOURCE_POINT_VOXEL_M=0.4
# Couleur cuite dans le nuage : « ortho » l'échantillonne dans l'orthophotographie recalée,
# comme le fait l'IGN pour l'exploitation architecturale du LiDAR HD, « classification »
# garde la palette par classe. Le visualiseur bascule ensuite librement entre classification,
# réflectance et altitude ; seule la photographie doit être cuite, faute d'être calculable à
# l'affichage. Hors couverture, le repli est automatique.
SOURCE_POINT_COLOR=ortho
# {plan.terrain_side_m:g} m de côté sur {plan.ortho_size_px} px, soit {plan.ortho_resolution_m * 100:.0f} cm/pixel.
# Monter plus haut se heurterait aux limites de la Géoplateforme, qui plafonne la requête
# WMS à {MAX_ORTHO_SIZE_PX} pixels.
ORTHO_SIZE_PX={plan.ortho_size_px}
BUILDING_SKIRT_M=2
BUILDING_SKIRT_MIN_M=1
BUILDING_SKIRT_MAX_M=8
# Remplace les toitures signalées comme dégradées par Roofer par une extrusion LoD1 franche.
DEGRADED_ROOF_LOD1=1
# Proxys de végétation haute reconstruits depuis la classe LiDAR 5.
VEGETATION=1
VEGETATION_MIN_HEIGHT_M=4
# Fenêtre de détection des cimes, exprimée en mètres : elle ne suit pas la maille du terrain
# et n'a donc pas à être retouchée ici.
VEGETATION_PEAK_WINDOW_M=5
# Plafond du rayon de couronne. Avec la segmentation, il n'est plus qu'un garde-fou contre un
# arbre de lisière qui annexerait tout un versant ; au profil radial, il tranchait pour près de
# la moitié des sujets. `trees.json` porte le compte de ceux qu'il borne encore.
VEGETATION_MAX_CROWN_M=6.4
# Mesure du houppier par ligne de partage des eaux sur le modèle de hauteur de canopée : les
# cimes servent de marqueurs et deux arbres jointifs se partagent la vallée qui les sépare.
# 0 rétablit le profil radial des exécutions antérieures, pour comparer sur une emprise réelle.
VEGETATION_CROWN_SEGMENTATION=1
# Teinte chaque houppier avec la couleur réelle de l'arbre, lue dans l'orthophotographie.
VEGETATION_TINT_FROM_ORTHO=1
# Classe la silhouette en feuillu, conifère ou mixte depuis le WFS officiel BD Forêt V2.
# Un échec du service conserve le profil générique et ne bloque pas la scène.
VEGETATION_FOREST_TYPES=1
# Second recours sur les cimes que BD Forêt laisse génériques, par la BD TOPO : celle-ci
# cartographie haies, landes ligneuses, bois et forêts ouvertes, là où BD Forêt ne décrit que
# des massifs d'au moins 5 000 m². Non bloquant lui aussi.
VEGETATION_LANDCOVER=1
# Relief du houppier, en fraction de son rayon : le rayon de chaque sommet est tiré autour de
# sa valeur nominale, de façon stable pour un arbre donné. La rotation et l'ovalité cassaient
# la répétition d'un arbre au suivant, pas la régularité de chacun — un icosaèdre reste une
# boule à facettes dès qu'on l'approche. Aucun triangle ni octet de plus. 0 rétablit la
# géométrie régulière.
VEGETATION_CROWN_IRREGULARITY=0.18
# Nappe de couvert continu sous les proxys individuels. Le défaut reste désactivé : elle est
# réservée aux grandes emprises dont la densité rend les houppiers isolés insuffisants.
CANOPY_MASSIF=0
CANOPY_MASSIF_COVERAGE=0.6
CANOPY_MASSIF_SMOOTHING_M=5
# Strate arbustive : tapis de végétation basse et moyenne tiré des classes LiDAR 3 et 4. Ces
# deux classes ne pesaient que dans le modèle de surface et l'occlusion, alors qu'elles portent
# la garrigue et le sous-bois — et la continuité verticale du combustible qui décide de la
# propagation d'un feu du sol vers les houppiers.
UNDERSTORY=1
# Plancher de la strate. Sous ce seuil, la mesure décrit surtout le bruit du sol et les herbes
# rases, que le terrain restitue déjà. Le plafond, lui, n'est pas réglable ici : c'est
# VEGETATION_MIN_HEIGHT_M, au-delà duquel la cellule appartient à un arbre.
UNDERSTORY_MIN_HEIGHT_M=0.5
# Fraction de cellules végétalisées exigée dans le voisinage. Plus bas que la canopée dense :
# un sous-bois est par nature discontinu, et le seuil de celle-ci n'en laisserait rien.
UNDERSTORY_COVERAGE=0.35
# Rayon de lissage du sommet du tapis, en mètres. Court : la strate épouse le relief de près,
# et l'aplanir sur plusieurs mètres lui ferait franchir murets et talus.
UNDERSTORY_SMOOTHING_M=2
# Eau (classe LiDAR 9) et tabliers de pont (classe 17), déjà présents dans lidar_subset.laz.
WATER=1
# Relèvement de la nappe au-dessus de l'altitude mesurée. La nappe et le terrain
# s'entrecroisent : quelques centimètres suffisent à éviter que le raccord ne se lise en
# damier, sans supprimer les bancs de galets émergents.
WATER_LIFT_M=0.2
BRIDGES=1
BRIDGE_THICKNESS_M=1.0
# Occlusion ambiante cuite en COLOR_0 : assombrit ruelles et pieds de murs dans tout moteur.
AMBIENT_OCCLUSION=1
OCCLUSION_AZIMUTHS=16
OCCLUSION_RADIUS_M=30
OCCLUSION_STRENGTH=0.6
# Calibration de l'orthophotographie, à mesurer sur l'image par `poc.py sun` une fois
# l'exécution amont faite. L'emprise étant carrée, la mesure s'applique : ne décommenter que
# pour forcer des valeurs connues par ailleurs.
#ORTHO_SUN_AZIMUTH_DEG=95
#ORTHO_SUN_ELEVATION_DEG=35
#ORTHO_OFFSET_EAST=-0.34
#ORTHO_OFFSET_NORTH=-2.58
ORTHO_LAYER="ORTHOIMAGERY.ORTHOPHOTOS"
ORTHO_WMS_URL="https://data.geopf.fr/wms-r/wms"
# Carte géologique BRGM, BD Charm-50 harmonisée à 1/50 000, drapée sur le terrain dans le
# visualiseur. L'archive se télécharge par département et se met en cache dans .work/geology/,
# partagée par toutes les scènes du même département. Le BRGM n'étant pas la Géoplateforme,
# l'étape ne bloque jamais : hors ligne ou hors couverture, la scène se produit sans la carte.
GEOLOGY=1
# À renseigner : numéro du département de l'emprise, sur trois chiffres (030 pour le Gard,
# 048 pour la Lozère, 2A et 2B pour la Corse). Il ne se déduit pas des coordonnées
# Lambert-93, et un mauvais département donne une carte hors emprise.
GEOLOGY_DEPARTMENT=""
# Côté de la texture géologique. 2048 px tient largement le 1/50 000 sur une emprise de
# quelques centaines de mètres : au-delà, on lisse des contours dont la source ne porte pas
# la précision. Les limites de la BD Charm-50 ne conviennent pas à une lecture parcellaire.
GEOLOGY_TEXTURE_SIZE_PX=2048
OUTPUT_DIR="{plan.output_dir}"
"""


def _area_geojson(plan: ScenePlan) -> str:
    """Aperçu cartographique de l'emprise, en WGS84.

    Sert de contrôle visuel avant de lancer une exécution qui coûte plusieurs centaines de
    mégaoctets de téléchargement : le fichier s'ouvre dans n'importe quel visualiseur
    GeoJSON, et c'est le seul moyen simple de constater qu'on a inversé latitude et
    longitude.
    """
    longitude, latitude = plan.centre_wgs84
    side = round(plan.request.side_m)
    document = {
        "type": "FeatureCollection",
        "name": plan.identifier,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": f"{plan.identifier}-centre",
                    "name": plan.request.title,
                    "role": "scene_centre",
                    "requested_wgs84": [plan.request.longitude, plan.request.latitude],
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(longitude, 8), round(latitude, 8)],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "id": f"{plan.identifier}-emprise",
                    "name": f"Emprise {side} × {side} m — {plan.request.title}",
                    "role": "processing_bbox",
                    "crs_processing": "EPSG:2154",
                    "bbox_l93": list(plan.bbox),
                    "width_m": side,
                    "height_m": side,
                    "area_m2": side * side,
                    "buffer_m": plan.request.terrain_margin_m,
                    "lidar_tiles": plan.tiles,
                },
                "geometry": {"type": "Polygon", "coordinates": [bbox_corners(plan.bbox).as_ring()]},
            },
        ],
    }
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def write_scene(plan: ScenePlan, root: Path, *, overwrite: bool = False) -> list[Path]:
    """Écrit la configuration de la scène et son aperçu, et rend les chemins produits.

    Le `.conf` et son `.example` sont écrits ensemble et identiques : les avoir laissés
    diverger avait déjà rendu une correction documentée sans effet à l'exécution.
    """
    config_dir = root / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    configuration = _configuration_text(plan)
    targets = {
        config_dir / f"{plan.identifier}.conf": configuration,
        config_dir / f"{plan.identifier}.conf.example": configuration,
        config_dir / f"{plan.identifier}.geojson": _area_geojson(plan),
    }
    existing = [path for path in targets if path.exists()]
    if existing and not overwrite:
        names = ", ".join(path.name for path in existing)
        raise FileExistsError(f"Déjà présent : {names}. Relancer avec --overwrite pour remplacer.")
    for path, content in targets.items():
        # `newline="\n"` et non le défaut : sous Windows, Python traduirait en CRLF des
        # fichiers que le dépôt tient en LF, et le diff entier passerait en modifié.
        path.write_text(content, encoding="utf-8", newline="\n")
    return list(targets)
