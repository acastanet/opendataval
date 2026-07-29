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


def _inside_polygon(
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
    height, width = grid.shape
    seated = 0
    for polygon, elevation in iter_ground_footprints(cityjson):
        polygon_x = np.array([point[0] for point in polygon])
        polygon_y = np.array([point[1] for point in polygon])
        first = max(0, int((ymax - polygon_y.max()) // resolution))
        last = min(height - 1, int((ymax - polygon_y.min()) // resolution))
        left = max(0, int((polygon_x.min() - xmin) // resolution))
        right = min(width - 1, int((polygon_x.max() - xmin) // resolution))
        if last < first or right < left:
            continue
        x, y = np.meshgrid(
            xmin + (np.arange(left, right + 1) + 0.5) * resolution,
            ymax - (np.arange(first, last + 1) + 0.5) * resolution,
        )
        inside = _inside_polygon(polygon_x, polygon_y, x, y)
        if not inside.any():
            continue
        block = grid[first : last + 1, left : right + 1]
        block[inside] = np.minimum(block[inside], elevation)
        seated += int(inside.sum())
    return seated


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
    selected = (
        (classification == 2)
        & (x >= xmin)
        & (x <= xmax)
        & (y >= ymin)
        & (y <= ymax)
    )
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

    Image.fromarray(grid.astype(np.float32), mode="F").save(
        terrain_tif, compression="tiff_lzw"
    )
    (run_dir / "terrain.tfw").write_text(
        "\n".join(
            (
                f"{resolution}",
                "0.0",
                "0.0",
                f"{-resolution}",
                f"{xmin + resolution / 2}",
                f"{ymax - resolution / 2}",
            )
        )
        + "\n",
        encoding="ascii",
    )
    (run_dir / "terrain.prj").write_text(
        'PROJCS["RGF93 v1 / Lambert-93",AUTHORITY["EPSG","2154"]]\n',
        encoding="ascii",
    )
    np.save(terrain_grid, grid)
    # Produit hérité : sa présence ferait relire une emprise périmée par la scène GLB.
    (run_dir / "terrain.xyz").unlink(missing_ok=True)

    for artifact in (terrain_tif, terrain_grid):
        if not artifact.is_file() or artifact.stat().st_size == 0:
            raise RuntimeError(f"Terrain non produit : {artifact}")
    print(
        f"Terrain généré : {terrain_tif} "
        f"({width} × {height} cellules, {seated} assises sous les bâtiments)"
    )
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
