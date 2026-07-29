from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import json
import math
import struct

from .config import PocConfig, latest_run
from .footprints import MINIMUM_LOD, geometry_faces, lod_value, select_geometry
from .triangulate import triangulate


FLOAT = 5126
UNSIGNED_INT = 5125
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


def _cross(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    c: tuple[float, float, float],
) -> tuple[float, float, float]:
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx = uy * vz - uz * vy
    ny = uz * vx - ux * vz
    nz = ux * vy - uy * vx
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    return (nx / length, ny / length, nz / length) if length else (0.0, 1.0, 0.0)


def _triangles(ring: list[int]) -> Iterable[tuple[int, int, int]]:
    if len(ring) >= 3:
        for index in range(1, len(ring) - 1):
            yield ring[0], ring[index], ring[index + 1]


class GlbBuilder:
    def __init__(self) -> None:
        self.binary = bytearray()
        self.buffer_views: list[dict] = []
        self.accessors: list[dict] = []
        self.materials: list[dict] = []
        self.images: list[dict] = []
        self.textures: list[dict] = []
        self.samplers: list[dict] = []
        self.meshes: list[dict] = []
        self.nodes: list[dict] = []

    def _view(self, payload: bytes, target: int | None = None) -> int:
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        self.binary.extend(payload)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(payload)}
        if target:
            view["target"] = target
        self.buffer_views.append(view)
        return len(self.buffer_views) - 1

    def _accessor(
        self,
        values: list[tuple[float, ...]] | list[int],
        *,
        component_type: int,
        value_type: str,
        target: int,
    ) -> int:
        if component_type == FLOAT:
            flat = [component for value in values for component in value]  # type: ignore[union-attr]
            payload = struct.pack(f"<{len(flat)}f", *flat)
        else:
            flat = list(values)  # type: ignore[arg-type]
            payload = struct.pack(f"<{len(flat)}I", *flat)
        view = self._view(payload, target)
        accessor: dict = {
            "bufferView": view,
            "componentType": component_type,
            "count": len(values),
            "type": value_type,
        }
        if values and value_type in {"VEC2", "VEC3"}:
            width = len(values[0])  # type: ignore[arg-type,index]
            accessor["min"] = [
                min(value[index] for value in values)  # type: ignore[union-attr]
                for index in range(width)
            ]
            accessor["max"] = [
                max(value[index] for value in values)  # type: ignore[union-attr]
                for index in range(width)
            ]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add_material(
        self,
        name: str,
        color: tuple[float, float, float, float],
        *,
        roughness: float = 0.85,
        texture: int | None = None,
        double_sided: bool = True,
    ) -> int:
        pbr: dict = {
            "baseColorFactor": list(color),
            "metallicFactor": 0.0,
            "roughnessFactor": roughness,
        }
        if texture is not None:
            pbr["baseColorTexture"] = {"index": texture}
        self.materials.append(
            {"name": name, "pbrMetallicRoughness": pbr, "doubleSided": double_sided}
        )
        return len(self.materials) - 1

    def add_texture(self, image_data: bytes, mime_type: str = "image/jpeg") -> int:
        image_view = self._view(image_data)
        self.images.append({"bufferView": image_view, "mimeType": mime_type})
        if not self.samplers:
            self.samplers.append(
                {
                    "magFilter": 9729,
                    "minFilter": 9987,
                    "wrapS": 33071,
                    "wrapT": 33071,
                }
            )
        self.textures.append({"sampler": 0, "source": len(self.images) - 1})
        return len(self.textures) - 1

    def primitive(
        self,
        positions: list[tuple[float, float, float]],
        normals: list[tuple[float, float, float]],
        indices: list[int],
        material: int,
        uvs: list[tuple[float, float]] | None = None,
    ) -> dict:
        attributes = {
            "POSITION": self._accessor(
                positions, component_type=FLOAT, value_type="VEC3", target=ARRAY_BUFFER
            ),
            "NORMAL": self._accessor(
                normals, component_type=FLOAT, value_type="VEC3", target=ARRAY_BUFFER
            ),
        }
        if uvs is not None:
            attributes["TEXCOORD_0"] = self._accessor(
                uvs, component_type=FLOAT, value_type="VEC2", target=ARRAY_BUFFER
            )
        return {
            "attributes": attributes,
            "indices": self._accessor(
                indices,
                component_type=UNSIGNED_INT,
                value_type="SCALAR",
                target=ELEMENT_ARRAY_BUFFER,
            ),
            "material": material,
            "mode": 4,
        }

    def add_mesh(self, name: str, primitives: list[dict]) -> None:
        if not primitives:
            return
        self.meshes.append({"name": name, "primitives": primitives})
        self.nodes.append({"name": name, "mesh": len(self.meshes) - 1})

    def write(self, path: Path, extras: dict | None = None) -> None:
        document = {
            "asset": {"version": "2.0", "generator": "OpenDataVdA POC Python"},
            "scene": 0,
            "scenes": [{"nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "buffers": [{"byteLength": len(self.binary)}],
            "bufferViews": self.buffer_views,
            "accessors": self.accessors,
        }
        if self.images:
            document["images"] = self.images
            document["textures"] = self.textures
            document["samplers"] = self.samplers
        if extras:
            document["asset"]["extras"] = extras

        json_chunk = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode(
            "utf-8"
        )
        json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
        bin_chunk = bytes(self.binary)
        bin_chunk += b"\0" * ((4 - len(bin_chunk) % 4) % 4)
        length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
        payload = (
            struct.pack("<4sII", b"glTF", 2, length)
            + struct.pack("<I4s", len(json_chunk), b"JSON")
            + json_chunk
            + struct.pack("<I4s", len(bin_chunk), b"BIN\0")
            + bin_chunk
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)


@dataclass
class TerrainMesh:
    positions: list[tuple[float, float, float]]
    normals: list[tuple[float, float, float]]
    uvs: list[tuple[float, float]]
    indices: list[int]
    base_elevation: float
    min_elevation: float
    max_elevation: float


def load_terrain(
    config: PocConfig, xyz_path: Path | None = None, grid: object | None = None
) -> TerrainMesh:
    # Le terrain et l'orthophotographie couvrent l'emprise élargie, mais la scène reste
    # centrée sur POC_BBOX afin de coïncider avec le repère des bâtiments.
    xmin, ymin, xmax, ymax = config.terrain_bbox
    center_x, center_y = sum(config.bbox[::2]) / 2, sum(config.bbox[1::2]) / 2
    if grid is not None:
        try:
            height, width = grid.shape  # type: ignore[union-attr]
            if height < 2 or width < 2:
                raise ValueError
            resolution = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
            elevations = [float(value) for row in grid for value in row]  # type: ignore[union-attr]
        except (AttributeError, TypeError, ValueError):
            raise ValueError("Grille de terrain invalide") from None
        if not elevations or any(not math.isfinite(value) or value <= -9000 for value in elevations):
            raise RuntimeError("Aucun point de terrain valide dans la grille NumPy")
        base = math.floor(min(elevations))
        positions = [
            (
                xmin + (column + 0.5) * resolution - center_x,
                float(grid[row, column]) - base,  # type: ignore[index]
                center_y - (ymax - (row + 0.5) * resolution),
            )
            for row in range(height)
            for column in range(width)
        ]
        # glTF place l'origine des UV au coin supérieur gauche de l'image, soit le
        # nord-ouest de l'orthophotographie : v croît donc avec la ligne de la grille.
        uvs = [
            (
                (column + 0.5) * resolution / (xmax - xmin),
                (row + 0.5) * resolution / (ymax - ymin),
            )
            for row in range(height)
            for column in range(width)
        ]
        indices = [
            index
            for row in range(height - 1)
            for column in range(width - 1)
            for index in (
                row * width + column,
                (row + 1) * width + column,
                row * width + column + 1,
                row * width + column + 1,
                (row + 1) * width + column,
                (row + 1) * width + column + 1,
            )
        ]
        return _terrain_mesh(positions, uvs, indices, base, elevations)

    points: dict[tuple[float, float], float] = {}
    if xyz_path is None or not xyz_path.is_file():
        raise FileNotFoundError("Grille terrain absente : terrain.npy ou terrain.xyz requis")
    for raw_line in xyz_path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip():
            continue
        x, y, z = map(float, raw_line.split())
        if z > -9000 and math.isfinite(z):
            points[(x, y)] = z
    if not points:
        raise RuntimeError(f"Aucun point de terrain valide dans {xyz_path}")

    xs = sorted({point[0] for point in points})
    ys = sorted({point[1] for point in points}, reverse=True)
    elevations = list(points.values())
    base = math.floor(min(elevations))

    positions: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    lookup: dict[tuple[int, int], int] = {}
    for row, y in enumerate(ys):
        for column, x in enumerate(xs):
            z = points.get((x, y))
            if z is None:
                continue
            lookup[(row, column)] = len(positions)
            positions.append((x - center_x, z - base, center_y - y))
            uvs.append(((x - xmin) / (xmax - xmin), (ymax - y) / (ymax - ymin)))

    indices: list[int] = []
    for row in range(len(ys) - 1):
        for column in range(len(xs) - 1):
            corners = [
                lookup.get((row, column)),
                lookup.get((row, column + 1)),
                lookup.get((row + 1, column)),
                lookup.get((row + 1, column + 1)),
            ]
            if any(value is None for value in corners):
                continue
            a, b, c, d = (int(value) for value in corners)
            indices.extend((a, c, b, b, c, d))

    return _terrain_mesh(positions, uvs, indices, base, elevations)


def _terrain_mesh(
    positions: list[tuple[float, float, float]],
    uvs: list[tuple[float, float]],
    indices: list[int],
    base: float,
    elevations: list[float],
) -> TerrainMesh:
    accumulated = [[0.0, 0.0, 0.0] for _ in positions]
    for offset in range(0, len(indices), 3):
        tri = indices[offset : offset + 3]
        normal = _cross(*(positions[index] for index in tri))
        if normal[1] < 0:
            indices[offset + 1], indices[offset + 2] = indices[offset + 2], indices[offset + 1]
            normal = tuple(-value for value in normal)
        for index in tri:
            for axis in range(3):
                accumulated[index][axis] += normal[axis]
    normals = []
    for value in accumulated:
        length = math.sqrt(sum(component * component for component in value)) or 1.0
        normals.append(tuple(component / length for component in value))

    return TerrainMesh(
        positions,
        normals,
        uvs,
        indices,
        base,
        min(elevations),
        max(elevations),
    )


def _append_triangle(
    group: tuple[list, list, list], triangle: list[tuple[float, float, float]]
) -> None:
    positions, normals, indices = group
    normal = _cross(*triangle)
    start = len(positions)
    positions.extend(triangle)
    normals.extend([normal, normal, normal])
    indices.extend((start, start + 1, start + 2))


def _append_skirt(
    group: tuple[list, list, list], vertices: list[tuple[float, float, float]], ring: list[int], skirt_m: float
) -> None:
    if len(ring) < 3:
        return
    ground_normal = _newell_normal(vertices, ring)
    if ground_normal == (0.0, 0.0, 0.0):
        return
    for first, second in zip(ring, ring[1:] + ring[:1]):
        top_a, top_b = vertices[first], vertices[second]
        bottom_a = (top_a[0], top_a[1] - skirt_m, top_a[2])
        bottom_b = (top_b[0], top_b[1] - skirt_m, top_b[2])
        triangles = ([top_a, top_b, bottom_b], [top_a, bottom_b, bottom_a])
        edge = (top_b[0] - top_a[0], top_b[1] - top_a[1], top_b[2] - top_a[2])
        expected = (
            edge[1] * ground_normal[2] - edge[2] * ground_normal[1],
            edge[2] * ground_normal[0] - edge[0] * ground_normal[2],
            edge[0] * ground_normal[1] - edge[1] * ground_normal[0],
        )
        for triangle in triangles:
            normal = _cross(*triangle)
            if sum(normal[axis] * expected[axis] for axis in range(3)) < 0:
                triangle[1], triangle[2] = triangle[2], triangle[1]
            _append_triangle(group, triangle)


def _newell_normal(vertices: list[tuple[float, float, float]], ring: list[int]) -> tuple[float, float, float]:
    nx = ny = nz = 0.0
    for first, second in zip(ring, ring[1:] + ring[:1]):
        ax, ay, az = vertices[first]
        bx, by, bz = vertices[second]
        nx += (ay - by) * (az + bz)
        ny += (az - bz) * (ax + bx)
        nz += (ax - bx) * (ay + by)
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    return (nx / length, ny / length, nz / length) if length else (0.0, 0.0, 0.0)


def load_buildings(
    config: PocConfig,
    cityjson_path: Path | Iterable[Path],
    base_elevation: float,
) -> tuple[dict[str, tuple[list, list, list]], int]:
    groups: dict[str, tuple[list, list, list]] = {
        "walls": ([], [], []),
        "roofs": ([], [], []),
    }
    xmin, ymin, xmax, ymax = config.bbox
    center_x, center_y = (xmin + xmax) / 2, (ymin + ymax) / 2

    cityjson_paths = [cityjson_path] if isinstance(cityjson_path, Path) else list(cityjson_path)
    ignored_lods: dict[str, int] = {}
    building_count = 0
    for path in cityjson_paths:
        with path.open(encoding="utf-8") as stream:
            header = json.loads(next(stream))
            scale = header["transform"]["scale"]
            translate = header["transform"]["translate"]
            for line in stream:
                if not line.strip():
                    continue
                feature = json.loads(line)
                vertices = [
                (
                    raw[0] * scale[0] + translate[0] - center_x,
                    raw[2] * scale[2] + translate[2] - base_elevation,
                    center_y - (raw[1] * scale[1] + translate[1]),
                )
                    for raw in feature.get("vertices", [])
                ]
                used_feature = False
                for city_object in feature.get("CityObjects", {}).values():
                    # Un Building délègue sa géométrie détaillée à ses BuildingPart et ne
                    # conserve qu'une enveloppe LoD 0 : l'ignorer sans avertir.
                    if city_object.get("children"):
                        continue
                    geometry = select_geometry(city_object)
                    if geometry is None:
                        continue
                    if lod_value(geometry) < MINIMUM_LOD:
                        label = str(geometry.get("lod", "inconnu"))
                        ignored_lods[label] = ignored_lods.get(label, 0) + 1
                        continue
                    for rings, surface_type in geometry_faces(geometry):
                        if not rings:
                            continue
                        if surface_type == "GroundSurface":
                            _append_skirt(groups["walls"], vertices, rings[0], config.get_float("BUILDING_SKIRT_M", 2.0))
                            continue
                        group_name = "roofs" if surface_type == "RoofSurface" else "walls"
                        try:
                            triangles = triangulate(vertices, rings)
                        except ValueError:
                            triangles = list(_triangles(rings[0]))
                        for ia, ib, ic in triangles:
                            _append_triangle(groups[group_name], [vertices[ia], vertices[ib], vertices[ic]])
                            used_feature = True
                building_count += int(used_feature)
    if ignored_lods:
        details = ", ".join(f"{count} objet(s) LoD {lod}" for lod, count in sorted(ignored_lods.items()))
        print(f"AVERTISSEMENT : aucune géométrie LoD {MINIMUM_LOD} pour {details} ; objets ignorés.")
    return groups, building_count


def create_scene_glb(config: PocConfig, run_dir: Path | None = None) -> Path:
    import numpy as np

    run_dir = run_dir or latest_run(config, require_complete=True)
    xyz_path = run_dir / "terrain.xyz"
    ortho_path = run_dir / "orthophoto.jpg"
    cityjson_files = sorted((run_dir / "roofer_output").glob("*.city.jsonl"))
    grid_path = run_dir / "terrain.npy"
    for required in (ortho_path,):
        if not required.is_file():
            raise FileNotFoundError(f"Artefact requis absent : {required}")
    if not grid_path.is_file() and not xyz_path.is_file():
        raise FileNotFoundError(f"Artefact terrain absent : {grid_path} ou {xyz_path}")
    if not cityjson_files:
        raise FileNotFoundError(f"CityJSONSeq absent dans {run_dir / 'roofer_output'}")

    grid = np.load(grid_path) if grid_path.is_file() else None
    terrain = load_terrain(config, xyz_path, grid)
    building_groups, building_count = load_buildings(config, cityjson_files, terrain.base_elevation)
    builder = GlbBuilder()
    texture = builder.add_texture(ortho_path.read_bytes())
    terrain_material = builder.add_material(
        "Orthophoto IGN", (1.0, 1.0, 1.0, 1.0), roughness=1.0, texture=texture
    )
    wall_material = builder.add_material(
        "Murs", (0.78, 0.72, 0.62, 1.0), roughness=0.9, double_sided=False
    )
    roof_material = builder.add_material(
        "Toitures", (0.55, 0.16, 0.09, 1.0), roughness=0.82, double_sided=False
    )

    builder.add_mesh(
        "Terrain",
        [
            builder.primitive(
                terrain.positions,
                terrain.normals,
                terrain.indices,
                terrain_material,
                terrain.uvs,
            )
        ],
    )
    building_primitives = []
    for group_name, material in (("walls", wall_material), ("roofs", roof_material)):
        positions, normals, indices = building_groups[group_name]
        if positions:
            building_primitives.append(
                builder.primitive(positions, normals, indices, material)
            )
    builder.add_mesh("Batiments", building_primitives)

    render_dir = run_dir / "render"
    scene_path = render_dir / "scene.glb"
    metadata = {
        "buildings": building_count,
        "bbox": list(config.bbox),
        "baseElevation": terrain.base_elevation,
        "minElevation": terrain.min_elevation,
        "maxElevation": terrain.max_elevation,
        "sourceCityJSONSeq": [path.name for path in cityjson_files],
    }
    builder.write(scene_path, extras=metadata)
    (render_dir / "scene.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Scène GLB générée : {scene_path} ({scene_path.stat().st_size:,} octets)")
    return scene_path
