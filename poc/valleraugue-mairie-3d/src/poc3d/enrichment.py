from __future__ import annotations

from pathlib import Path
import json
import math
import urllib.parse
import urllib.request

import laspy
import numpy as np
from PIL import Image

from .config import PocConfig, latest_run
from .footprints import iter_ground_footprints
from .raster import (
    cell_centers,
    dilate,
    inside_polygon,
    maximum_by_cell,
    nearest_outward,
    polygon_window,
)


# Classes ASPRS retenues pour le modèle de surface : les trois strates végétales et le bâti
# au-dessus du MNT. C'est ce relief-là — celui qui masque le ciel — que l'occlusion interroge.
# Le MNS doit porter tout ce qui dépasse le sol. La classe 5 reste la seule retenue pour
# détecter les cimes individuelles, mais les strates 3 et 4 comptent elles aussi dans la
# surface « avec végétation ».
VEGETATION_CLASSES = (3, 4, 5)
HIGH_VEGETATION_CLASS = 5
# Strates basse et moyenne : buissons, ronces, garrigue et jeunes tiges. Elles voyagent depuis
# toujours dans `lidar_subset.laz` sans que rien ne les montre — elles ne pesaient que dans le
# modèle de surface et l'occlusion. C'est sur cette continuité entre le sol et les houppiers
# que se juge le débroussaillement, et elle n'existait nulle part en 3D.
UNDERSTORY_CLASSES = (3, 4)
BUILDING_CLASS = 6
GROUND_CLASS = 2
LAMBERT_93_EPSG = 2154


def _blend_seating(
    config: PocConfig, grid: np.ndarray, target: np.ndarray, resolution: float
) -> None:
    """Applique l'assise en la raccordant progressivement au relief naturel.

    Abaisser le terrain sous la seule emprise laisse une marche verticale d'une cellule
    au ras du mur, d'autant plus visible que la pente est forte. Le fondu sur
    ``TERRAIN_BLEND_M`` transforme cette marche en talus, comme le ferait un décaissement.
    """
    reached = np.isfinite(target)
    weight = reached.astype(np.float64)
    filled = target.copy()
    steps = max(0, round(config.get_float("TERRAIN_BLEND_M", 3.0) / resolution))
    for step in range(1, steps + 1):
        grown = dilate(reached)
        ring = grown & ~reached
        if not ring.any():
            break
        neighbour = nearest_outward(filled, reached)
        filled[ring] = neighbour[ring]
        weight[ring] = 1.0 - step / (steps + 1)
        reached = grown
    seated = np.minimum(grid, np.where(np.isfinite(filled), filled, grid))
    grid += (seated - grid) * weight


def _seat_buildings(config: PocConfig, grid: np.ndarray, run_dir: Path) -> int:
    """Abaisse le terrain sous chaque emprise au niveau de la base du bâtiment.

    Roofer pose les bâtiments sur un plan horizontal alors que le terrain est en pente :
    sans cette assise, le relief traverse le pied des murs du côté amont.
    """
    cityjson = sorted((run_dir / "roofer_output").glob("*.city.jsonl"))
    if not cityjson:
        return 0
    resolution = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
    xmin, _, _, ymax = config.terrain_bbox
    # Les emprises sont d'abord accumulées : deux bâtiments mitoyens doivent s'accorder sur
    # une assise commune plutôt que s'écraser l'un l'autre au fil de l'itération.
    target = np.full(grid.shape, np.inf)
    for polygon, elevation in iter_ground_footprints(cityjson):
        polygon_x = np.array([point[0] for point in polygon])
        polygon_y = np.array([point[1] for point in polygon])
        window = polygon_window(polygon_x, polygon_y, xmin, ymax, resolution, grid.shape)
        if window is None:
            continue
        first, last, left, right = window
        x, y = cell_centers(window, xmin, ymax, resolution)
        inside = inside_polygon(polygon_x, polygon_y, x, y)
        if not inside.any():
            continue
        block = target[first : last + 1, left : right + 1]
        np.minimum(block, elevation, out=block, where=inside)
    seated = int(np.isfinite(target).sum())
    if seated:
        _blend_seating(config, grid, target, resolution)
    return seated


def _surface_models(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    classification: np.ndarray,
    within: np.ndarray,
    terrain: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Canopée, strate arbustive et modèle numérique de surface, sur la grille du MNT.

    Les trois se déduisent du nuage déjà chargé pour le terrain : les recalculer ailleurs
    imposerait une seconde lecture du LAZ pour exactement la même information. La strate
    arbustive n'a d'ailleurs rien coûté à produire — le maximum par cellule des classes 3
    et 4 était déjà calculé pour le modèle de surface, et personne ne le regardait.

    La canopée et la strate arbustive sont des **hauteurs au-dessus du sol** — c'est cela
    qui décide qu'un point est un arbre ou un buisson — alors que la surface reste une
    **altitude absolue**, comparable au terrain par le balayage d'horizon.
    """
    shape = terrain.shape
    highest = {
        klass: maximum_by_cell(
            x[within & (classification == klass)],
            y[within & (classification == klass)],
            z[within & (classification == klass)],
            xmin,
            ymax,
            resolution,
            shape,
        )
        for klass in (*VEGETATION_CLASSES, BUILDING_CLASS)
    }
    canopy = highest[HIGH_VEGETATION_CLASS] - terrain
    # Une cime sous le niveau du sol n'existe pas : c'est le signe d'un point mal classé.
    canopy[~np.isfinite(canopy) | (canopy <= 0)] = np.nan

    understory = terrain.copy()
    for klass in UNDERSTORY_CLASSES:
        understory = np.fmax(understory, highest[klass])
    understory -= terrain
    understory[~np.isfinite(understory) | (understory <= 0)] = np.nan

    surface = terrain.copy()
    for klass in (*VEGETATION_CLASSES, BUILDING_CLASS):
        surface = np.fmax(surface, highest[klass])
    return canopy, understory, surface


def _write_geotiff(
    destination: Path,
    grid: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
) -> None:
    """Écrit une grille en GeoTIFF géoréférencé sur l'emprise, en Lambert-93.

    Le terrain sortait auparavant en TIFF nu flanqué d'un `.tfw` et d'un `.prj`, faute d'un
    écrivain géospatial. Le géoréférencement vit désormais dans le fichier lui-même, ce qui
    supprime la possibilité d'un `.tfw` resté en arrière d'une exécution à l'autre — un
    worldfile périmé prime sur les métadonnées dans plusieurs SIG et décale la couche sans
    rien signaler.

    Les cellules sans mesure valent ``NaN`` et sont déclarées comme telles : c'est la
    convention de `canopy.npy` comme des nappes, et elle traverse le GeoTIFF intacte.
    """
    from rasterio.transform import from_origin
    import rasterio

    with rasterio.open(
        destination,
        "w",
        driver="GTiff",
        height=grid.shape[0],
        width=grid.shape[1],
        count=1,
        dtype="float32",
        crs=f"EPSG:{LAMBERT_93_EPSG}",
        transform=from_origin(xmin, ymax, resolution, resolution),
        nodata=float("nan"),
        compress="lzw",
    ) as raster:
        raster.write(grid.astype(np.float32), 1)


def _save_nappes(
    config: PocConfig,
    run_dir: Path,
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    classification: np.ndarray,
    within: np.ndarray,
    xmin: float,
    ymax: float,
    resolution: float,
    shape: tuple[int, int],
) -> None:
    """Écrit les nappes d'eau et de pont, tirées du nuage déjà chargé pour le terrain.

    Les deux classes voyagent depuis toujours dans ``lidar_subset.laz`` sans être exploitées.
    Les extraire ici évite une seconde lecture du LAZ pour la même information, comme pour la
    canopée et le modèle de surface.
    """
    from .surfaces import bridge_surface, water_surface

    for name, builder, enabled in (
        ("water", water_surface, config.get_bool("WATER", True)),
        ("bridge", bridge_surface, config.get_bool("BRIDGES", True)),
    ):
        destination = run_dir / f"{name}.npy"
        if not enabled:
            destination.unlink(missing_ok=True)
            continue
        nappe = builder(x, y, z, classification, within, xmin, ymax, resolution, shape)
        if nappe.is_empty():
            destination.unlink(missing_ok=True)
            continue
        np.save(destination, nappe.elevations)


def create_terrain(config: PocConfig, run_dir: Path | None = None) -> tuple[Path, Path]:
    run_dir = run_dir or latest_run(config, require_complete=True)
    source = run_dir / "lidar_subset.laz"
    if not source.is_file() or source.stat().st_size == 0:
        raise FileNotFoundError(f"Nuage LiDAR absent : {source}")

    resolution = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
    terrain_tif = run_dir / "terrain.tif"
    terrain_grid = run_dir / "terrain.npy"
    xmin, ymin, xmax, ymax = config.terrain_bbox
    width = max(1, math.ceil((xmax - xmin) / resolution))
    height = max(1, math.ceil((ymax - ymin) / resolution))

    print(f"Lecture LiDAR native : {source.name}")
    cloud = laspy.read(source)
    x = np.asarray(cloud.x)
    y = np.asarray(cloud.y)
    z = np.asarray(cloud.z)
    classification = np.asarray(cloud.classification)
    within = (x >= xmin) & (x <= xmax) & (y >= ymin) & (y <= ymax)
    selected = (classification == GROUND_CLASS) & within
    if not np.any(selected):
        raise RuntimeError("Aucun point LiDAR de classe sol (2) dans l'emprise")

    columns = np.floor((x[selected] - xmin) / resolution).astype(np.int64)
    rows = np.floor((ymax - y[selected]) / resolution).astype(np.int64)
    columns = np.clip(columns, 0, width - 1)
    rows = np.clip(rows, 0, height - 1)
    flat = rows * width + columns
    counts = np.bincount(flat, minlength=width * height)
    sums = np.bincount(flat, weights=z[selected], minlength=width * height)
    grid = np.full(width * height, np.nan, dtype=np.float64)
    populated = counts > 0
    grid[populated] = sums[populated] / counts[populated]
    grid = grid.reshape((height, width))
    measured = np.isfinite(grid)

    # Comble les cellules vides par propagation de la moyenne des 8 voisines.
    for _ in range(max(width, height)):
        missing = ~np.isfinite(grid)
        if not np.any(missing):
            break
        padded = np.pad(grid, 1, mode="constant", constant_values=np.nan)
        neighbour_sum = np.zeros_like(grid)
        neighbour_count = np.zeros_like(grid, dtype=np.int16)
        for row_offset in range(3):
            for column_offset in range(3):
                if row_offset == 1 and column_offset == 1:
                    continue
                neighbour = padded[
                    row_offset : row_offset + height,
                    column_offset : column_offset + width,
                ]
                valid = np.isfinite(neighbour)
                neighbour_sum[valid] += neighbour[valid]
                neighbour_count[valid] += 1
        fillable = missing & (neighbour_count > 0)
        if not np.any(fillable):
            break
        grid[fillable] = neighbour_sum[fillable] / neighbour_count[fillable]
    if not np.all(np.isfinite(grid)):
        raise RuntimeError("Le terrain contient encore des cellules sans altitude")

    # Lisse exclusivement les valeurs interpolées : les mesures LiDAR restent exactes.
    interpolated = ~measured
    for _ in range(3):
        padded = np.pad(grid, 1, mode="edge")
        average = np.zeros_like(grid)
        for row_offset in range(3):
            for column_offset in range(3):
                average += padded[
                    row_offset : row_offset + height,
                    column_offset : column_offset + width,
                ]
        average /= 9
        grid[interpolated] = average[interpolated]

    seated = _seat_buildings(config, grid, run_dir)
    canopy, understory, surface = _surface_models(
        x, y, z, classification, within, grid, xmin, ymax, resolution
    )
    np.save(run_dir / "canopy.npy", canopy)
    np.save(run_dir / "surface.npy", surface)
    understory_grid = run_dir / "understory.npy"
    if config.get_bool("UNDERSTORY", True):
        np.save(understory_grid, understory)
    else:
        understory_grid.unlink(missing_ok=True)
    _save_nappes(config, run_dir, x, y, z, classification, within, xmin, ymax, resolution, grid.shape)

    _write_geotiff(terrain_tif, grid, xmin, ymax, resolution)
    # Le modèle de hauteur de canopée et la strate arbustive sortent eux aussi en GeoTIFF :
    # ils portent la mesure sur laquelle se juge la continuité verticale du combustible, et
    # cette lecture-là se fait dans un SIG, pas dans le visualiseur.
    _write_geotiff(run_dir / "canopy.tif", canopy, xmin, ymax, resolution)
    if config.get_bool("UNDERSTORY", True):
        _write_geotiff(run_dir / "understory.tif", understory, xmin, ymax, resolution)
    else:
        (run_dir / "understory.tif").unlink(missing_ok=True)
    # Le géoréférencement vit désormais dans le GeoTIFF : laissés en place, ces deux fichiers
    # d'une exécution antérieure primeraient sur lui dans plusieurs SIG.
    (run_dir / "terrain.tfw").unlink(missing_ok=True)
    (run_dir / "terrain.prj").unlink(missing_ok=True)
    np.save(terrain_grid, grid)
    # Produit hérité : sa présence ferait relire une emprise périmée par la scène GLB.
    (run_dir / "terrain.xyz").unlink(missing_ok=True)

    for artifact in (terrain_tif, terrain_grid):
        if not artifact.is_file() or artifact.stat().st_size == 0:
            raise RuntimeError(f"Terrain non produit : {artifact}")
    # Le taux de cellules mesurées dit si la donnée soutient la maille : le reste est
    # interpolé, et une chute sous couvert boisé se lit ici avant de se voir à l'écran.
    print(
        f"Terrain généré : {terrain_tif} "
        f"({width} × {height} cellules à {resolution:g} m, "
        f"{measured.mean():.1%} mesurées, "
        f"{seated} assises sous les bâtiments)"
    )
    cells = grid.size
    print(
        f"Modèles dérivés : canopée sur {int(np.isfinite(canopy).sum())} cellules "
        f"({np.isfinite(canopy).mean():.0%}), strate arbustive sur "
        f"{int(np.isfinite(understory).sum())} cellules "
        f"({np.isfinite(understory).mean():.0%}), surface pour l'occlusion ambiante"
    )
    # La superposition d'une strate basse et d'un houppier est la continuité verticale du
    # combustible : c'est par elle qu'un feu de surface gagne la canopée, et elle ne se lit
    # sur aucune des deux couches prise seule.
    both = np.isfinite(canopy) & np.isfinite(understory)
    print(f"Continuité verticale : {int(both.sum())} cellules ({both.sum() / cells:.0%})")
    return terrain_tif, terrain_grid


def download_orthophoto(config: PocConfig, run_dir: Path | None = None) -> Path:
    run_dir = run_dir or latest_run(config, require_complete=True)
    xmin, ymin, xmax, ymax = config.terrain_bbox
    size = config.get_int("ORTHO_SIZE_PX", 1024)
    layer = config.get("ORTHO_LAYER", "ORTHOIMAGERY.ORTHOPHOTOS")
    endpoint = config.get("ORTHO_WMS_URL", "https://data.geopf.fr/wms-r/wms")
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": layer,
        "STYLES": "",
        "CRS": "EPSG:2154",
        "BBOX": f"{xmin:g},{ymin:g},{xmax:g},{ymax:g}",
        "WIDTH": str(size),
        "HEIGHT": str(size),
        "FORMAT": "image/jpeg",
    }
    url = endpoint + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": config.get("HTTP_USER_AGENT", "OpenDataVdA-POC/2.0")},
    )
    print(f"Téléchargement orthophoto IGN : {size} × {size} px")
    with urllib.request.urlopen(request, timeout=60) as response:
        content_type = response.headers.get_content_type()
        data = response.read()
    if content_type != "image/jpeg" or not data.startswith(b"\xff\xd8"):
        raise RuntimeError(f"Réponse WMS inattendue : {content_type}, {len(data)} octets")

    image_path = run_dir / "orthophoto.jpg"
    image_path.write_bytes(data)
    metadata = {
        "source": endpoint,
        "layer": layer,
        "bbox": [xmin, ymin, xmax, ymax],
        "crs": "EPSG:2154",
        "width": size,
        "height": size,
    }
    (run_dir / "orthophoto.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Orthophoto enregistrée : {image_path}")
    return image_path
