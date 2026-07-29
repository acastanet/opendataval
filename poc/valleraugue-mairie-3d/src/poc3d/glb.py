from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable
import json
import math
import struct
import zlib

from .config import PocConfig, latest_run
from .footprints import MINIMUM_LOD, geometry_faces, lod_value, select_geometry
from .roofs import is_degraded
from .triangulate import is_convex, triangulate


# Une teinte unique pour tous les murs et une autre pour toutes les toitures aplatissaient
# le bâti : la légère variation ci-dessous redonne de la lecture aux volumes voisins.
WALL_COLORS = (
    (0.86, 0.83, 0.75, 1.0),
    (0.82, 0.78, 0.70, 1.0),
    (0.88, 0.86, 0.80, 1.0),
    (0.79, 0.76, 0.71, 1.0),
    (0.84, 0.80, 0.72, 1.0),
)
ROOF_COLORS = (
    (0.50, 0.26, 0.19, 1.0),
    (0.46, 0.24, 0.18, 1.0),
    (0.54, 0.30, 0.22, 1.0),
    (0.43, 0.25, 0.20, 1.0),
    (0.51, 0.28, 0.16, 1.0),
)


def _palette_index(name: str, size: int) -> int:
    """Choisit une teinte de façon stable d'une exécution à l'autre.

    ``hash`` est randomisé par processus : le CRC garantit qu'un même bâtiment garde sa
    couleur entre deux générations de la scène.
    """
    return zlib.crc32(name.encode("utf-8")) % size


FOLIAGE_COLORS = (
    (0.29, 0.42, 0.22, 1.0),
    (0.24, 0.36, 0.19, 1.0),
    (0.34, 0.46, 0.25, 1.0),
    (0.27, 0.39, 0.27, 1.0),
)
TRUNK_COLOR = (0.32, 0.26, 0.20, 1.0)


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
        self.roots: list[int] = []

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
        colors: list[tuple[float, float, float, float]] | None = None,
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
        # COLOR_0 porte l'occlusion ambiante cuite : tout moteur glTF la multiplie à la
        # couleur de base, sans passe de post-traitement ni dépendance au visualiseur.
        if colors:
            attributes["COLOR_0"] = self._accessor(
                colors, component_type=FLOAT, value_type="VEC4", target=ARRAY_BUFFER
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

    def add_mesh(self, name: str, primitives: list[dict], extras: dict | None = None) -> int | None:
        if not primitives:
            return None
        self.meshes.append({"name": name, "primitives": primitives})
        node: dict = {"name": name, "mesh": len(self.meshes) - 1}
        if extras:
            node["extras"] = extras
        self.nodes.append(node)
        index = len(self.nodes) - 1
        self.roots.append(index)
        return index

    def add_group(self, name: str, children: list[int]) -> int:
        """Rassemble des nœuds sous un parent : ils cessent d'être des racines de scène."""
        self.nodes.append({"name": name, "children": list(children)})
        index = len(self.nodes) - 1
        adopted = set(children)
        self.roots = [root for root in self.roots if root not in adopted]
        self.roots.append(index)
        return index

    def write(self, path: Path, extras: dict | None = None) -> None:
        document = {
            "asset": {"version": "2.0", "generator": "OpenDataVdA POC Python"},
            "scene": 0,
            "scenes": [{"nodes": self.roots}],
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
    colors: list[tuple[float, float, float, float]] = field(default_factory=list)


def load_terrain(
    config: PocConfig,
    xyz_path: Path | None = None,
    grid: object | None = None,
    ortho_offset: tuple[float, float] = (0.0, 0.0),
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
        # La même transformation sert aux toitures, calage de l'orthophoto compris.
        texture_uv = ortho_uv(config, ortho_offset)
        uvs = [
            texture_uv(
                xmin + (column + 0.5) * resolution,
                ymax - (row + 0.5) * resolution,
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
        mesh = _terrain_mesh(positions, uvs, indices, base, elevations)
        _append_terrain_skirt(
            mesh, width, height, config.get_float("TERRAIN_EDGE_SKIRT_M", 12.0)
        )
        return mesh

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
            uvs.append(ortho_uv(config, ortho_offset)(x, y))

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

    # La branche XYZ tolère des trous dans la grille : son contour n'est pas un anneau
    # continu, la jupe de bord n'y est donc pas applicable.
    return _terrain_mesh(positions, uvs, indices, base, elevations)


def _terrain_edges(width: int, height: int) -> list[tuple[int, int, tuple[float, float, float]]]:
    """Arêtes du contour de la grille, avec la direction extérieure de chacune."""
    south = (height - 1) * width
    east = width - 1
    edges: list[tuple[int, int, tuple[float, float, float]]] = []
    for column in range(width - 1):
        edges.append((column, column + 1, (0.0, 0.0, -1.0)))
        edges.append((south + column, south + column + 1, (0.0, 0.0, 1.0)))
    for row in range(height - 1):
        edges.append((row * width, (row + 1) * width, (-1.0, 0.0, 0.0)))
        edges.append((row * width + east, (row + 1) * width + east, (1.0, 0.0, 0.0)))
    return edges


def _append_terrain_skirt(mesh: TerrainMesh, width: int, height: int, depth: float) -> None:
    """Ferme le terrain par une jupe verticale sur tout son contour.

    Sans elle, la nappe se lit comme une dalle découpée dont on voit la tranche dès que la
    caméra s'approche de l'horizon. Toutes les arêtes descendent au même niveau afin que
    les quads voisins restent jointifs.
    """
    if depth <= 0 or width < 2 or height < 2:
        return
    bottom = mesh.min_elevation - mesh.base_elevation - depth
    for first, second, outward in _terrain_edges(width, height):
        top_a, top_b = mesh.positions[first], mesh.positions[second]
        quad = [
            top_a,
            top_b,
            (top_b[0], bottom, top_b[2]),
            (top_a[0], bottom, top_a[2]),
        ]
        start = len(mesh.positions)
        mesh.positions.extend(quad)
        # Le sampler est en CLAMP_TO_EDGE : reprendre les UV du haut étire le dernier
        # pixel de l'orthophotographie vers le bas, sans matériau supplémentaire.
        mesh.uvs.extend((mesh.uvs[first], mesh.uvs[second], mesh.uvs[second], mesh.uvs[first]))
        mesh.normals.extend([outward] * 4)
        for corners in ((0, 1, 2), (0, 2, 3)):
            left, middle, right = corners
            normal = _cross(quad[left], quad[middle], quad[right])
            if sum(normal[axis] * outward[axis] for axis in range(3)) < 0:
                middle, right = right, middle
            mesh.indices.extend((start + left, start + middle, start + right))


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


@dataclass
class SurfaceGroup:
    """Triangles d'un même matériau, avec des sommets dédupliqués par face."""

    positions: list[tuple[float, float, float]] = field(default_factory=list)
    normals: list[tuple[float, float, float]] = field(default_factory=list)
    uvs: list[tuple[float, float]] = field(default_factory=list)
    indices: list[int] = field(default_factory=list)
    colors: list[tuple[float, float, float, float]] = field(default_factory=list)


def _planar_uv(
    point: tuple[float, float, float], normal: tuple[float, float, float]
) -> tuple[float, float]:
    """Projette un sommet sur le plan dominant de sa face, à l'échelle du mètre.

    Une unité UV vaut un mètre : les matériaux tuilés appliqués en aval (crépi, tuiles)
    conservent ainsi leur échelle réelle sans réglage par bâtiment.
    """
    axis = max(range(3), key=lambda index: abs(normal[index]))
    if axis == 0:
        return (point[2], point[1])
    if axis == 1:
        return (point[0], point[2])
    return (point[0], point[1])


UvFunction = Callable[
    [tuple[float, float, float], tuple[float, float, float]], tuple[float, float]
]


def ortho_uv(
    config: PocConfig, offset: tuple[float, float] = (0.0, 0.0)
) -> Callable[[float, float], tuple[float, float]]:
    """Coordonnées de texture d'une position Lambert-93 dans l'orthophotographie.

    L'orthophotographie n'est pas calée sur les données bâties : sur ce site, le recalage des
    emprises révèle une translation constante de plusieurs mètres, sans dépendance à la
    hauteur des bâtiments. Terrain et toitures doivent la compenser de façon strictement
    identique, d'où cette transformation unique — trois conventions d'orientation se croisent
    ici et un signe divergent passerait inaperçu.
    """
    xmin, ymin, xmax, ymax = config.terrain_bbox
    east, north = offset

    def uv(x_l93: float, y_l93: float) -> tuple[float, float]:
        return (
            (x_l93 + east - xmin) / (xmax - xmin),
            (ymax - (y_l93 + north)) / (ymax - ymin),
        )

    return uv


def ortho_uv_projector(
    config: PocConfig,
    center: tuple[float, float],
    offset: tuple[float, float] = (0.0, 0.0),
) -> UvFunction:
    """Projette un sommet du repère GLB sur l'orthophotographie, vue de dessus.

    La photographie aérienne contient déjà les toitures réelles à une dizaine de centimètres
    par pixel : les y projeter vaut mieux que n'importe quelle teinte inventée.
    """
    center_x, center_y = center
    uv = ortho_uv(config, offset)

    def project(
        point: tuple[float, float, float], _normal: tuple[float, float, float]
    ) -> tuple[float, float]:
        return uv(point[0] + center_x, center_y - point[2])

    return project


def _append_triangle(
    group: SurfaceGroup,
    triangle: list[tuple[float, float, float]],
    uv_of: Callable[
        [tuple[float, float, float], tuple[float, float, float]], tuple[float, float]
    ] = _planar_uv,
) -> None:
    normal = _cross(*triangle)
    start = len(group.positions)
    group.positions.extend(triangle)
    group.normals.extend([normal, normal, normal])
    group.uvs.extend(uv_of(point, normal) for point in triangle)
    group.indices.extend((start, start + 1, start + 2))


def _append_skirt(
    group: SurfaceGroup, vertices: list[tuple[float, float, float]], ring: list[int], skirt_m: float
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


def _face_triangles(
    vertices: list[tuple[float, float, float]], rings: list[list[int]]
) -> tuple[list[tuple[int, int, int]], bool]:
    """Triangule une face et signale tout recours à une stratégie dégradée.

    L'éventail naïf relie chaque sommet au premier : correct sur un contour convexe, il
    produit des triangles hors du polygone dès qu'il est concave. Une toiture en L ainsi
    triangulée reste plausible à l'œil tout en étant géométriquement fausse ; mieux vaut
    l'abandonner et le signaler.
    """
    try:
        return triangulate(vertices, rings), False
    except ValueError:
        pass
    if len(rings) > 1:
        # Le pont vers un anneau intérieur est la cause d'échec la plus fréquente :
        # conserver le contour extérieur vaut mieux que perdre la face entière.
        try:
            return triangulate(vertices, rings[:1]), True
        except ValueError:
            pass
    if is_convex(vertices, rings[0]):
        return list(_triangles(rings[0])), True
    return [], True


def _skirt_depth(
    config: PocConfig,
    terrain: object | None,
    vertices: list[tuple[float, float, float]],
    ring: list[int],
    base_elevation: float,
    center: tuple[float, float],
) -> float:
    """Profondeur de jupe nécessaire pour rejoindre le terrain sous ce contour.

    Une jupe fixe ne convient pas sur un relief marqué : trop courte, elle laisse le
    bâtiment flotter du côté aval ; inutilement longue ailleurs, elle plonge sous le MNT.
    """
    fallback = config.get_float("BUILDING_SKIRT_M", 2.0)
    minimum = config.get_float("BUILDING_SKIRT_MIN_M", 1.0)
    maximum = config.get_float("BUILDING_SKIRT_MAX_M", 8.0)
    if terrain is None:
        return max(minimum, fallback)
    center_x, center_y = center
    floor = min(vertices[index][1] for index in ring) + base_elevation
    ground = terrain.minimum_around(
        [vertices[index][0] + center_x for index in ring],
        [center_y - vertices[index][2] for index in ring],
    )
    if ground is None:
        return max(minimum, fallback)
    return min(maximum, max(minimum, floor - ground + minimum))


@dataclass
class BuildingMesh:
    """Géométrie et attributs d'un bâtiment, conservés séparément des autres.

    Fusionner les bâtiments en une soupe de triangles rendait la scène inexploitable en
    aval : ni objet sélectionnable dans un logiciel de rendu, ni matériau par bâtiment.
    """

    name: str
    attributes: dict[str, object]
    walls: SurfaceGroup = field(default_factory=SurfaceGroup)
    roofs: SurfaceGroup = field(default_factory=SurfaceGroup)

    def group(self, name: str) -> SurfaceGroup:
        return self.roofs if name == "roofs" else self.walls


def load_buildings(
    config: PocConfig,
    cityjson_path: Path | Iterable[Path],
    base_elevation: float,
    terrain: object | None = None,
    ortho_offset: tuple[float, float] = (0.0, 0.0),
) -> list[BuildingMesh]:
    xmin, ymin, xmax, ymax = config.bbox
    center_x, center_y = (xmin + xmax) / 2, (ymin + ymax) / 2

    cityjson_paths = [cityjson_path] if isinstance(cityjson_path, Path) else list(cityjson_path)
    ignored_lods: dict[str, int] = {}
    fallbacks: dict[str, int] = {}
    buildings: list[BuildingMesh] = []
    roof_uv = (
        ortho_uv_projector(config, (center_x, center_y), ortho_offset)
        if config.get_bool("ROOF_TEXTURE_FROM_ORTHO", True)
        else _planar_uv
    )
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
                city_objects = feature.get("CityObjects", {})
                building = BuildingMesh(
                    name=str(feature.get("id") or f"batiment-{len(buildings)}"),
                    # Les attributs BD TOPO sont portés par le Building parent, la
                    # géométrie par ses BuildingPart : les rassembler sur un seul nœud.
                    attributes={
                        key: value
                        for city_object in city_objects.values()
                        for key, value in city_object.get("attributes", {}).items()
                    },
                )
                # Verdict de Roofer sur sa propre toiture, remonté au nœud : un consommateur
                # de la scène n'a pas à connaître le vocabulaire de `rf_roof_type`.
                building.attributes["rf_degraded"] = is_degraded(building.attributes)
                used_feature = False
                for city_object in city_objects.values():
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
                    # Le bâtiment est compté dès qu'il expose une géométrie exploitable :
                    # le faire au fil des triangles omettrait un volume réduit à sa jupe.
                    used_feature = True
                    for rings, surface_type in geometry_faces(geometry):
                        if not rings:
                            continue
                        if surface_type == "GroundSurface":
                            skirt = _skirt_depth(
                                config, terrain, vertices, rings[0], base_elevation, (center_x, center_y)
                            )
                            _append_skirt(building.walls, vertices, rings[0], skirt)
                            continue
                        group_name = "roofs" if surface_type == "RoofSurface" else "walls"
                        triangles, degraded = _face_triangles(vertices, rings)
                        if degraded:
                            label = surface_type or "inconnu"
                            fallbacks[label] = fallbacks.get(label, 0) + 1
                        uv_of = roof_uv if group_name == "roofs" else _planar_uv
                        for ia, ib, ic in triangles:
                            _append_triangle(
                                building.group(group_name),
                                [vertices[ia], vertices[ib], vertices[ic]],
                                uv_of,
                            )
                if used_feature:
                    buildings.append(building)
    if ignored_lods:
        details = ", ".join(f"{count} objet(s) LoD {lod}" for lod, count in sorted(ignored_lods.items()))
        print(f"AVERTISSEMENT : aucune géométrie LoD {MINIMUM_LOD} pour {details} ; objets ignorés.")
    if fallbacks:
        details = ", ".join(f"{count} face(s) {label}" for label, count in sorted(fallbacks.items()))
        print(f"AVERTISSEMENT : triangulation dégradée ou abandonnée pour {details}.")
    return buildings


def bake_colors(
    positions: list[tuple[float, float, float]],
    occlusion: object,
    centre: tuple[float, float],
    base_elevation: float,
) -> list[tuple[float, float, float, float]]:
    """Convertit des sommets du repère GLB en facteurs d'occlusion, un par sommet.

    Le repère de la scène est local et centré ; l'occlusion est indexée en Lambert-93 et en
    altitude absolue. La conversion se fait ici, en un seul endroit, parce qu'elle croise
    trois conventions d'orientation — X vers l'est, Z vers le sud, Y au-dessus de la base.
    """
    import numpy as np

    if not positions:
        return []
    centre_x, centre_y = centre
    x_l93 = np.fromiter((point[0] for point in positions), dtype=np.float64, count=len(positions)) + centre_x
    y_l93 = centre_y - np.fromiter(
        (point[2] for point in positions), dtype=np.float64, count=len(positions)
    )
    elevation = (
        np.fromiter((point[1] for point in positions), dtype=np.float64, count=len(positions))
        + base_elevation
    )
    return [(value, value, value, 1.0) for value in occlusion.at(x_l93, y_l93, elevation).tolist()]


def load_vegetation(
    config: PocConfig,
    trees: list,
    base_elevation: float,
    centre: tuple[float, float],
) -> dict[int, SurfaceGroup]:
    """Assemble les proxys d'arbres, groupés par teinte de feuillage.

    Un nœud par arbre serait ingérable dans la scène ; une teinte unique aplatirait le
    couvert. Le compromis est le même que pour le bâti : une petite palette, choisie de
    façon stable pour qu'un arbre garde sa couleur d'une génération à l'autre.
    """
    from .vegetation import tree_geometry

    groups: dict[int, SurfaceGroup] = {}
    for tree in trees:
        crown, trunk = tree_geometry(tree, centre, base_elevation)
        palette = _palette_index(f"{tree.x:.2f}:{tree.y:.2f}", len(FOLIAGE_COLORS))
        for index, triangles in ((palette, crown), (len(FOLIAGE_COLORS), trunk)):
            group = groups.setdefault(index, SurfaceGroup())
            for triangle in triangles:
                _append_triangle(group, list(triangle))
    return groups


def _load_occlusion(config: PocConfig, run_dir: Path, grid: object | None):
    """Prépare l'occlusion cuite, ou ``None`` si elle est désactivée ou inapplicable.

    L'absence de modèle de surface n'est pas une erreur : les exécutions antérieures à son
    introduction restent exploitables, simplement sans occlusion.
    """
    import numpy as np

    from .occlusion import bake_occlusion

    if not config.get_bool("AMBIENT_OCCLUSION", True) or grid is None:
        return None
    surface_path = run_dir / "surface.npy"
    if not surface_path.is_file():
        print("AVERTISSEMENT : surface.npy absent, occlusion ambiante non cuite.")
        return None
    surface = np.load(surface_path)
    if surface.shape != grid.shape:  # type: ignore[union-attr]
        print("AVERTISSEMENT : surface.npy ne correspond pas au terrain, occlusion ignorée.")
        return None
    xmin, _, _, ymax = config.terrain_bbox
    resolution = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
    print("Cuisson de l'occlusion ambiante (facteur de vue du ciel)…")
    return bake_occlusion(
        surface,
        grid,  # type: ignore[arg-type]
        xmin,
        ymax,
        resolution,
        azimuths=config.get_int("OCCLUSION_AZIMUTHS", 16),
        radius_m=config.get_float("OCCLUSION_RADIUS_M", 30.0),
        strength=config.get_float("OCCLUSION_STRENGTH", 0.6),
    )


def create_scene_glb(config: PocConfig, run_dir: Path | None = None) -> Path:
    import numpy as np

    from .raster import TerrainSampler
    from .roofs import read_roof_quality
    from .sun import measure_ortho_offset, measure_ortho_sun
    from .vegetation import load_trees

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
    # L'orthophotographie n'est pas calée sur les données bâties : le terrain comme les
    # toitures doivent compenser la même translation. Un échec de mesure ne doit pas
    # empêcher la production de la scène.
    offset = None
    try:
        offset = measure_ortho_offset(config, run_dir)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"AVERTISSEMENT : orthophotographie non recalée ({error}).")
    ortho_offset = (offset.east_m, offset.north_m) if offset else (0.0, 0.0)

    terrain = load_terrain(config, xyz_path, grid, ortho_offset)
    terrain_xmin, _, _, terrain_ymax = config.terrain_bbox
    sampler = (
        TerrainSampler(
            grid, terrain_xmin, terrain_ymax, config.get_float("TERRAIN_RESOLUTION_M", 1.0)
        )
        if grid is not None
        else None
    )
    buildings = load_buildings(
        config, cityjson_files, terrain.base_elevation, sampler, ortho_offset
    )
    scene_centre = (sum(config.bbox[::2]) / 2, sum(config.bbox[1::2]) / 2)
    trees = load_trees(run_dir) if config.get_bool("VEGETATION", True) else []
    vegetation = load_vegetation(config, trees, terrain.base_elevation, scene_centre)

    occlusion = _load_occlusion(config, run_dir, grid)
    if occlusion is not None:
        terrain.colors = bake_colors(
            terrain.positions, occlusion, scene_centre, terrain.base_elevation
        )
        for group in (
            *(group for building in buildings for group in (building.walls, building.roofs)),
            *vegetation.values(),
        ):
            group.colors = bake_colors(
                group.positions, occlusion, scene_centre, terrain.base_elevation
            )

    builder = GlbBuilder()
    texture = builder.add_texture(ortho_path.read_bytes())
    terrain_material = builder.add_material(
        "Orthophoto IGN", (1.0, 1.0, 1.0, 1.0), roughness=1.0, texture=texture
    )
    wall_materials = [
        builder.add_material(f"Murs {index + 1}", color, roughness=0.9, double_sided=False)
        for index, color in enumerate(WALL_COLORS)
    ]
    # Les toitures reprennent la texture de l'orthophotographie : même image, aucun octet
    # supplémentaire dans le binaire. Le repli en teintes unies reste disponible si le
    # décalage radial de l'ortho rectifiée au sol se révèle gênant.
    photo_roofs = config.get_bool("ROOF_TEXTURE_FROM_ORTHO", True)
    roof_materials = (
        [
            builder.add_material(
                "Toitures (orthophoto)",
                (1.0, 1.0, 1.0, 1.0),
                roughness=0.82,
                texture=texture,
                double_sided=False,
            )
        ]
        if photo_roofs
        else [
            builder.add_material(f"Toitures {index + 1}", color, roughness=0.82, double_sided=False)
            for index, color in enumerate(ROOF_COLORS)
        ]
    )
    # Les proxys de végétation sont dépourvus d'UV : le feuillage reste en aplat teinté, seule
    # l'occlusion cuite lui donne du volume. Un houppier n'est pas fermé au sens strict, d'où
    # le rendu double face.
    foliage_materials = [
        builder.add_material(f"Feuillage {index + 1}", color, roughness=0.95)
        for index, color in enumerate(FOLIAGE_COLORS)
    ] + [builder.add_material("Troncs", TRUNK_COLOR, roughness=0.95, double_sided=False)]

    builder.add_mesh(
        "Terrain",
        [
            builder.primitive(
                terrain.positions,
                terrain.normals,
                terrain.indices,
                terrain_material,
                terrain.uvs,
                terrain.colors,
            )
        ],
    )
    building_nodes = []
    for building in buildings:
        primitives = [
            builder.primitive(
                group.positions, group.normals, group.indices, material, group.uvs, group.colors
            )
            for group, material in (
                (building.walls, wall_materials[_palette_index(building.name, len(WALL_COLORS))]),
                (building.roofs, roof_materials[_palette_index(building.name, len(roof_materials))]),
            )
            if group.positions
        ]
        node = builder.add_mesh(building.name, primitives, extras=building.attributes)
        if node is not None:
            building_nodes.append(node)
    # Le nœud parent conserve le point d'entrée « Batiments » attendu par le visualiseur.
    builder.add_group("Batiments", building_nodes)
    if vegetation:
        builder.add_mesh(
            "Vegetation",
            [
                builder.primitive(
                    group.positions,
                    group.normals,
                    group.indices,
                    foliage_materials[palette],
                    None,
                    group.colors,
                )
                for palette, group in sorted(vegetation.items())
                if group.positions
            ],
            extras={"trees": len(trees)},
        )

    render_dir = run_dir / "render"
    scene_path = render_dir / "scene.glb"
    roof_quality = read_roof_quality(cityjson_files)
    metadata = {
        "buildings": len(buildings),
        "bbox": list(config.bbox),
        "baseElevation": terrain.base_elevation,
        "minElevation": terrain.min_elevation,
        "maxElevation": terrain.max_elevation,
        "terrainResolutionM": config.get_float("TERRAIN_RESOLUTION_M", 1.0),
        "sourceCityJSONSeq": [path.name for path in cityjson_files],
        # Roofer signale lui-même les toitures qu'il n'a pas su reconstruire : sans cette
        # clé, elles se lisent dans la scène comme n'importe quelle toiture mesurée.
        "roofQuality": roof_quality.as_metadata(),
        "trees": len(trees),
        "bakedOcclusion": occlusion is not None,
    }
    if roof_quality.degraded:
        print(
            f"AVERTISSEMENT : {len(roof_quality.degraded)} toiture(s) dégradée(s) sur "
            f"{roof_quality.total} ({roof_quality.ratio:.1%}) — voir roofQuality dans scene.json."
        )
    # Le visualiseur en a besoin pour caler son soleil sur les ombres de l'orthophotographie ;
    # un échec de calibration ne doit pas empêcher la production de la scène.
    try:
        metadata["orthoSun"] = measure_ortho_sun(config, run_dir).as_metadata()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"AVERTISSEMENT : calibration solaire indisponible ({error}).")
    if offset is not None:
        metadata["orthoOffset"] = offset.as_metadata()
    builder.write(scene_path, extras=metadata)
    render_dir.mkdir(parents=True, exist_ok=True)
    (render_dir / "scene.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (render_dir / "buildings.json").write_text(
        json.dumps(
            {building.name: building.attributes for building in buildings},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Scène GLB générée : {scene_path} ({scene_path.stat().st_size:,} octets)")
    return scene_path
