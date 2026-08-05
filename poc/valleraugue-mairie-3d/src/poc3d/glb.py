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


def srgb_to_linear(value: float) -> float:
    """Applique la fonction de transfert sRGB inverse à un canal dans [0, 1]."""
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def _srgb(hexadecimal: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Convertit une teinte sRGB hexadécimale en ``baseColorFactor`` glTF.

    ``baseColorFactor`` est interprété en espace **linéaire**. Y écrire directement la
    valeur qu'on lit dans un sélecteur de couleur éclaircit tout d'un cran : 0,86 linéaire
    s'affiche à 239/255, soit un mur quasi blanc. Les palettes restent donc écrites en sRGB,
    parce que c'est ainsi qu'on les choisit et qu'on les relit, et la conversion a lieu ici.
    """
    digits = hexadecimal.lstrip("#")
    if len(digits) != 6:
        raise ValueError(f"Teinte sRGB attendue au format #RRGGBB : {hexadecimal!r}")
    try:
        channels = [int(digits[offset : offset + 2], 16) / 255.0 for offset in (0, 2, 4)]
    except ValueError:
        raise ValueError(f"Teinte sRGB attendue au format #RRGGBB : {hexadecimal!r}") from None
    red, green, blue = (srgb_to_linear(channel) for channel in channels)
    return (red, green, blue, alpha)


# Une teinte unique pour tous les murs aplatissait le bâti. Les façades restent en aplat,
# sans texture, mais leur légère nuance est désormais pilotée par le code BD TOPO
# ``materiaux_des_murs`` plutôt que par l'identifiant arbitraire du bâtiment.
WALL_BASE_SRGB = (211, 201, 183)
ROOF_COLORS = tuple(
    _srgb(tint) for tint in ("#A85B3C", "#9C5236", "#B36641", "#94513E", "#AD5F30")
)


def _palette_index(name: str, size: int) -> int:
    """Choisit une teinte de façon stable d'une exécution à l'autre.

    ``hash`` est randomisé par processus : le CRC garantit qu'un même bâtiment garde sa
    couleur entre deux générations de la scène.
    """
    return zlib.crc32(name.encode("utf-8")) % size


def _facade_code(attributes: dict[str, object]) -> str | None:
    """Normalise le code façade BD TOPO porté par un bâtiment."""
    value = attributes.get("materiaux_des_murs")
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        parts = [str(part).strip() for part in value if str(part).strip()]
        return ",".join(parts) or None
    code = str(value).strip()
    return code or None


def _wall_color(code: str | None) -> tuple[float, float, float, float]:
    """Produit une nuance minérale discrète, stable et exclusivement liée au code."""
    if code is None:
        red, green, blue = WALL_BASE_SRGB
    else:
        checksum = zlib.crc32(code.encode("utf-8"))
        offsets = tuple(((checksum >> shift) & 0xFF) % 11 - 5 for shift in (0, 8, 16))
        red, green, blue = (
            max(0, min(255, channel + offset))
            for channel, offset in zip(WALL_BASE_SRGB, offsets)
        )
    return _srgb(f"#{red:02X}{green:02X}{blue:02X}")


# Le feuillage tient en un seul groupe : sa couleur vient de COLOR_0, pas du matériau.
FOLIAGE_GROUP = 0
TRUNK_GROUP = 1
# Teinte de repli, appliquée quand l'échantillonnage de l'orthophotographie est désactivé.
FOLIAGE_FALLBACK = _srgb("#4E6B3A")
TRUNK_COLOR = _srgb("#4A3A2C")
# Roche et terre de la tranche du terrain : neutre et mate, pour se lire comme une coupe
# et non comme une falaise naturelle.
SKIRT_COLOR = _srgb("#8C8377")
# L'eau doit d'abord se lire comme de l'eau : un bleu clair la sépare du terrain plus
# sûrement que sa seule rugosité, qui ne se voit qu'au soleil rasant. La teinte reste tirée
# vers le vert, en rivière et non en mer.
# L'eau laisse lire l'orthophotographie sous sa géométrie : la teinte gris-bleu signale la
# nappe sans devenir le premier plan de l'image.
WATER_COLOR = _srgb("#78939D", 0.58)
# Béton et pierre du tablier, plus froid que les enduits de façade pour s'en distinguer.
BRIDGE_COLOR = _srgb("#9A968E")
# Strate arbustive : plus sombre et nettement plus jaune que le feuillage des houppiers.
# Garrigue, ronces et sous-bois cévenols ne sont pas du vert de canopée, et surtout la nappe
# se lit sous les arbres — une teinte proche de la leur l'y ferait disparaître.
UNDERSTORY_COLOR = _srgb("#5E6435")


FLOAT = 5126
UNSIGNED_INT = 5125
UNSIGNED_BYTE = 5121
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
        values: list[tuple[float, ...]] | list[tuple[int, ...]] | list[int],
        *,
        component_type: int,
        value_type: str,
        target: int,
        normalized: bool = False,
    ) -> int:
        if component_type == FLOAT:
            flat = [component for value in values for component in value]  # type: ignore[union-attr]
            payload = struct.pack(f"<{len(flat)}f", *flat)
        elif component_type == UNSIGNED_BYTE:
            flat = [component for value in values for component in value]  # type: ignore[union-attr]
            payload = bytes(flat)
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
        if normalized:
            accessor["normalized"] = True
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
        alpha_mode: str | None = None,
        alpha_cutoff: float = 0.5,
        double_sided: bool = True,
    ) -> int:
        pbr: dict = {
            "baseColorFactor": list(color),
            "metallicFactor": 0.0,
            "roughnessFactor": roughness,
        }
        if texture is not None:
            pbr["baseColorTexture"] = {"index": texture}
        material = {"name": name, "pbrMetallicRoughness": pbr, "doubleSided": double_sided}
        if alpha_mode:
            material["alphaMode"] = alpha_mode
            if alpha_mode == "MASK":
                material["alphaCutoff"] = alpha_cutoff
        self.materials.append(material)
        return len(self.materials) - 1

    def add_texture(
        self, image_data: bytes, mime_type: str = "image/jpeg", *, repeat: bool = False
    ) -> int:
        image_view = self._view(image_data)
        self.images.append({"bufferView": image_view, "mimeType": mime_type})
        wrap = 10497 if repeat else 33071
        sampler = {
            "magFilter": 9729,
            "minFilter": 9987,
            "wrapS": wrap,
            "wrapT": wrap,
        }
        try:
            sampler_index = self.samplers.index(sampler)
        except ValueError:
            self.samplers.append(sampler)
            sampler_index = len(self.samplers) - 1
        self.textures.append({"sampler": sampler_index, "source": len(self.images) - 1})
        return len(self.textures) - 1

    def array_accessor(
        self,
        array,
        *,
        component_type: int,
        value_type: str,
        target: int = ARRAY_BUFFER,
        normalized: bool = False,
    ) -> int:
        """Accessor écrit directement depuis un tableau numpy, sans listes intermédiaires.

        Un nuage LiDAR porte des centaines de milliers de points : les convertir en listes de
        tuples Python pour les repacker ensuite coûte un ordre de grandeur de plus que d'en
        recopier les octets — mesuré à 0,22 s contre 0,02 s pour 750 000 positions. Le reste
        du builder travaille sur des listes et continue de le faire ; seule la géométrie de
        masse passe par ici.
        """
        import numpy as np

        dtype = {FLOAT: "<f4", UNSIGNED_BYTE: "<u1", UNSIGNED_INT: "<u4"}[component_type]
        values = np.ascontiguousarray(array, dtype=dtype)
        view = self._view(values.tobytes(), target)
        accessor: dict = {
            "bufferView": view,
            "componentType": component_type,
            "count": int(values.shape[0]),
            "type": value_type,
        }
        if normalized:
            accessor["normalized"] = True
        # La spécification n'exige `min`/`max` que sur POSITION, mais le builder les pose déjà
        # sur tous les VEC2/VEC3 : garder la même règle évite deux comportements à expliquer.
        if values.size and value_type in {"VEC2", "VEC3"}:
            accessor["min"] = values.min(axis=0).tolist()
            accessor["max"] = values.max(axis=0).tolist()
        self.accessors.append(accessor)
        return len(self.accessors) - 1

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

    def point_primitive(
        self,
        positions,
        colors,
        material: int,
        extra_attributes: dict[str, object] | None = None,
    ) -> dict:
        """Nuage glTF en points, coloré sans gonfler chaque canal en float32.

        ``extra_attributes`` accueille les attributs applicatifs du nuage LiDAR, dont le nom
        doit commencer par un tiret bas comme l'exige glTF 2.0. Chacun est un tableau
        ``uint8`` de quatre canaux : la spécification impose d'aligner les éléments d'attribut
        sur quatre octets, un scalaire ``uint8`` non entrelacé serait non conforme, et quatre
        canaux ne coûtent pas plus qu'un seul aligné.
        """
        if len(positions) != len(colors):
            raise ValueError("Chaque point doit porter une couleur")
        attributes = {
            "POSITION": self.array_accessor(
                positions, component_type=FLOAT, value_type="VEC3"
            ),
            "COLOR_0": self.array_accessor(
                colors, component_type=UNSIGNED_BYTE, value_type="VEC4", normalized=True
            ),
        }
        for name, values in (extra_attributes or {}).items():
            if not name.startswith("_"):
                raise ValueError(f"Attribut glTF applicatif attendu sous _NOM : {name!r}")
            if len(values) != len(positions):  # type: ignore[arg-type]
                raise ValueError(f"{name} doit porter une valeur par point")
            attributes[name] = self.array_accessor(
                values, component_type=UNSIGNED_BYTE, value_type="VEC4"
            )
        return {
            "attributes": attributes,
            "material": material,
            "mode": 0,
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
class SurfaceGroup:
    """Triangles d'un même matériau, avec des sommets dédupliqués par face."""

    positions: list[tuple[float, float, float]] = field(default_factory=list)
    normals: list[tuple[float, float, float]] = field(default_factory=list)
    uvs: list[tuple[float, float]] = field(default_factory=list)
    indices: list[int] = field(default_factory=list)
    colors: list[tuple[float, float, float, float]] = field(default_factory=list)


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
    # La tranche est un groupe distinct : elle n'a pas d'orthophotographie à porter et
    # relève d'un matériau propre.
    skirt: SurfaceGroup = field(default_factory=SurfaceGroup)


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
            mesh, width, height, config.get_float("TERRAIN_EDGE_SKIRT_M", 6.0)
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
    """Ferme le terrain par une tranche verticale sur tout son contour.

    Sans elle, la nappe se lit comme une dalle découpée dont on voit le dessous dès que la
    caméra s'approche de l'horizon.

    Chaque arête descend de ``depth`` **sous le terrain qu'elle borde**, et non jusqu'à une
    altitude absolue commune : sur les 57 m de dénivelé du site, un fond unique produisait
    une falaise de près de 70 m au bord amont, plus haute que tout le bâti réuni. Les quads
    voisins restent jointifs puisqu'ils partagent leurs sommets hauts.
    """
    if depth <= 0 or width < 2 or height < 2:
        return
    for first, second, outward in _terrain_edges(width, height):
        top_a, top_b = mesh.positions[first], mesh.positions[second]
        quad = [
            top_a,
            top_b,
            (top_b[0], top_b[1] - depth, top_b[2]),
            (top_a[0], top_a[1] - depth, top_a[2]),
        ]
        start = len(mesh.skirt.positions)
        mesh.skirt.positions.extend(quad)
        mesh.skirt.normals.extend([outward] * 4)
        for corners in ((0, 1, 2), (0, 2, 3)):
            left, middle, right = corners
            normal = _cross(quad[left], quad[middle], quad[right])
            if sum(normal[axis] * outward[axis] for axis in range(3)) < 0:
                middle, right = right, middle
            mesh.skirt.indices.extend((start + left, start + middle, start + right))


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


def _lod1_height(
    attributes: dict[str, object],
    base_y: float,
    vertices: list[tuple[float, float, float]],
) -> tuple[float, str]:
    """Retient une hauteur explicite, puis l'enveloppe Roofer comme dernier repli."""
    try:
        measured = float(attributes.get("hauteur", 0))
    except (TypeError, ValueError):
        measured = 0.0
    if math.isfinite(measured) and measured > 0:
        return measured, "hauteur"
    envelope = max((vertex[1] for vertex in vertices), default=base_y) - base_y
    return max(1.0, envelope), "enveloppe_roofer"


def _append_lod1_geometry(
    building: BuildingMesh,
    geometry: dict[str, object],
    vertices: list[tuple[float, float, float]],
    roof_uv: UvFunction,
    config: PocConfig,
    terrain: object | None,
    base_elevation: float,
    center: tuple[float, float],
) -> tuple[bool, str | None]:
    """Extrude horizontalement l'emprise d'un bâtiment dont la toiture est incertaine."""
    ground_faces = [
        rings
        for rings, surface_type in geometry_faces(geometry)
        if surface_type == "GroundSurface" and rings
    ]
    if not ground_faces:
        return False, None

    generated = False
    height_source: str | None = None
    for rings in ground_faces:
        indices = [index for ring in rings for index in ring]
        if len(rings[0]) < 3 or not indices:
            continue
        base_y = min(vertices[index][1] for index in indices)
        height, height_source = _lod1_height(building.attributes, base_y, vertices)
        top_y = base_y + height
        top_vertices = list(vertices)
        for index in indices:
            x, _y, z = top_vertices[index]
            top_vertices[index] = (x, top_y, z)

        triangles, degraded = _face_triangles(top_vertices, rings)
        if not triangles:
            continue
        for ia, ib, ic in triangles:
            triangle = [top_vertices[ia], top_vertices[ib], top_vertices[ic]]
            if _cross(*triangle)[1] < 0:
                triangle[1], triangle[2] = triangle[2], triangle[1]
            _append_triangle(building.roofs, triangle, roof_uv)

        contact_depth = _skirt_depth(
            config, terrain, vertices, rings[0], base_elevation, center
        )
        wall_depth = height + contact_depth
        for ring in rings:
            _append_skirt(building.walls, top_vertices, ring, wall_depth)
        generated = True
        if degraded:
            building.attributes["rf_lod1_triangulation_degraded"] = True
    return generated, height_source


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
                usable_geometries: list[dict[str, object]] = []
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
                    usable_geometries.append(geometry)

                used_feature = False
                if (
                    building.attributes["rf_degraded"]
                    and config.get_bool("DEGRADED_ROOF_LOD1", True)
                ):
                    height_sources: set[str] = set()
                    for geometry in usable_geometries:
                        generated, height_source = _append_lod1_geometry(
                            building,
                            geometry,
                            vertices,
                            roof_uv,
                            config,
                            terrain,
                            base_elevation,
                            (center_x, center_y),
                        )
                        used_feature = used_feature or generated
                        if height_source:
                            height_sources.add(height_source)
                    if used_feature:
                        building.attributes["rf_rendered_lod"] = "1"
                        building.attributes["rf_lod1_fallback"] = True
                        building.attributes["rf_lod1_height_source"] = (
                            next(iter(height_sources)) if len(height_sources) == 1 else "mixte"
                        )
                        buildings.append(building)
                        continue

                for geometry in usable_geometries:
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
    tints: list[tuple[float, float, float]] | None = None,
) -> dict[int, SurfaceGroup]:
    """Assemble les proxys d'arbres : le feuillage sous l'index 0, les fûts sous l'index 1.

    Un nœud par arbre serait ingérable dans la scène, et une teinte unique aplatirait le
    couvert. La couleur passe donc par ``COLOR_0``, sommet par sommet — canal déjà présent
    pour l'occlusion ambiante, donc gratuit en octets — et non par un matériau par nuance :
    chaque arbre peut ainsi porter sa propre teinte sans multiplier les primitives.
    """
    from .vegetation import CROWN_IRREGULARITY, tree_geometry

    irregularity = max(
        0.0, config.get_float("VEGETATION_CROWN_IRREGULARITY", CROWN_IRREGULARITY)
    )
    groups: dict[int, SurfaceGroup] = {}
    for index, tree in enumerate(trees):
        crown, trunk = tree_geometry(tree, centre, base_elevation, irregularity)
        tint = tints[index] if tints else None
        colour = (
            (srgb_to_linear(tint[0]), srgb_to_linear(tint[1]), srgb_to_linear(tint[2]), 1.0)
            if tint
            else None
        )
        # Une normale par face, ici comme partout ailleurs : la recette a retenu le houppier
        # facetté, qui se lit comme une représentation. Le lissage radial essayé ensuite est
        # resté au visualiseur, où il se compare sans réassembler la scène — un solide de douze
        # sommets dont l'intérieur se prétend rond mais dont la silhouette reste anguleuse
        # produit surtout une bulle.
        for key, triangles, vertex_colour in (
            (FOLIAGE_GROUP, crown, colour),
            (TRUNK_GROUP, trunk, None),
        ):
            group = groups.setdefault(key, SurfaceGroup())
            for triangle in triangles:
                _append_triangle(group, list(triangle))
                if vertex_colour is not None:
                    group.colors.extend([vertex_colour] * 3)
    # Un groupe partiellement coloré produirait un accesseur plus court que les positions :
    # mieux vaut renoncer à la teinte que d'écrire un GLB incohérent.
    for group in groups.values():
        if group.colors and len(group.colors) != len(group.positions):
            group.colors = []
    return groups


def _combine_colors(
    tints: list[tuple[float, float, float, float]],
    occlusion: list[tuple[float, float, float, float]],
) -> list[tuple[float, float, float, float]]:
    """Multiplie une teinte par sommet par l'occlusion cuite, dans le seul canal COLOR_0.

    Les deux informations partagent le même attribut et doivent donc se composer plutôt que
    s'écraser : la teinte dit de quelle couleur est l'objet, l'occlusion combien de ciel il
    voit.
    """
    if not tints:
        return occlusion
    if not occlusion:
        return tints
    return [
        (tint[0] * shade[0], tint[1] * shade[1], tint[2] * shade[2], 1.0)
        for tint, shade in zip(tints, occlusion)
    ]


def _foliage_tints(
    config: PocConfig,
    run_dir: Path,
    trees: list,
    ortho_path: Path,
    ortho_offset: tuple[float, float],
) -> list[tuple[float, float, float]] | None:
    """Teinte de chaque houppier, échantillonnée dans l'orthophotographie.

    Un échec de lecture d'image ne doit pas empêcher la production de la scène : la
    végétation retombe alors sur la teinte de repli du matériau.
    """
    import numpy as np
    from PIL import Image

    from .vegetation import sample_foliage_tints

    if not trees or not config.get_bool("VEGETATION_TINT_FROM_ORTHO", True):
        return None
    try:
        with Image.open(ortho_path) as image:
            pixels = np.asarray(image.convert("RGB"), dtype=np.float64) / 255.0
    except (OSError, ValueError) as error:
        print(f"AVERTISSEMENT : feuillage non teinté depuis l'orthophotographie ({error}).")
        return None
    return sample_foliage_tints(trees, pixels, ortho_uv(config, ortho_offset))


def _load_nappes(
    config: PocConfig,
    run_dir: Path,
    base_elevation: float,
    centre: tuple[float, float],
    terrain_grid: object | None,
) -> dict[str, SurfaceGroup]:
    """Assemble les nappes d'eau, de pont et de canopée disponibles.

    Leur absence n'est pas une erreur : une exécution antérieure à leur introduction, ou une
    emprise sans cours d'eau, reste parfaitement exploitable.
    """
    import numpy as np

    from .surfaces import canopy_massif, load_nappe, surface_triangles, understory_blanket

    xmin, _, _, ymax = config.terrain_bbox
    resolution = config.get_float("TERRAIN_RESOLUTION_M", 1.0)
    # Le relèvement ne corrige pas la mesure : `water.npy` conserve l'altitude ajustée sur le
    # LiDAR. C'est un décalage de raccord, appliqué ici pour qu'un essai coûte un `poc.py glb`
    # et non une relecture complète du nuage.
    lift = {
        "water": config.get_float("WATER_LIFT_M", 0.2),
        "bridge": 0.0,
    }
    groups: dict[str, SurfaceGroup] = {}
    for name, enabled, thickness in (
        ("water", config.get_bool("WATER", True), 0.0),
        ("bridge", config.get_bool("BRIDGES", True), config.get_float("BRIDGE_THICKNESS_M", 1.0)),
    ):
        if not enabled:
            continue
        nappe = load_nappe(run_dir / f"{name}.npy")
        if nappe is None or nappe.is_empty():
            continue
        group = SurfaceGroup()
        for triangle in surface_triangles(
            nappe.elevations + lift[name],
            xmin,
            ymax,
            resolution,
            centre,
            base_elevation,
            thickness,
        ):
            _append_triangle(group, list(triangle))
        groups[name] = group

    if config.get_bool("CANOPY_MASSIF", False) and terrain_grid is not None:
        canopy_path = run_dir / "canopy.npy"
        if not canopy_path.is_file():
            print("AVERTISSEMENT : canopy.npy absent, massif de canopée ignoré.")
        else:
            try:
                nappe = canopy_massif(
                    np.load(canopy_path),
                    terrain_grid,  # type: ignore[arg-type]
                    resolution,
                    coverage=config.get_float("CANOPY_MASSIF_COVERAGE", 0.6),
                    minimum_height=config.get_float("VEGETATION_MIN_HEIGHT_M", 4.0),
                    smoothing=config.get_float("CANOPY_MASSIF_SMOOTHING_M", 5.0),
                )
            except ValueError as error:
                print(f"AVERTISSEMENT : massif de canopée ignoré ({error}).")
            else:
                if not nappe.is_empty():
                    group = SurfaceGroup()
                    for triangle in surface_triangles(
                        nappe.elevations,
                        xmin,
                        ymax,
                        resolution,
                        centre,
                        base_elevation,
                    ):
                        _append_triangle(group, list(triangle))
                    groups["massif"] = group

    if config.get_bool("UNDERSTORY", True) and terrain_grid is not None:
        understory_path = run_dir / "understory.npy"
        if not understory_path.is_file():
            # Une exécution antérieure à la strate arbustive reste parfaitement exploitable :
            # elle produit la scène sans elle, comme une emprise sans cours d'eau.
            print("AVERTISSEMENT : understory.npy absent, strate arbustive ignorée.")
        else:
            try:
                nappe = understory_blanket(
                    np.load(understory_path),
                    terrain_grid,  # type: ignore[arg-type]
                    resolution,
                    minimum_height=config.get_float("UNDERSTORY_MIN_HEIGHT_M", 0.5),
                    maximum_height=config.get_float("VEGETATION_MIN_HEIGHT_M", 4.0),
                    coverage=config.get_float("UNDERSTORY_COVERAGE", 0.35),
                    smoothing=config.get_float("UNDERSTORY_SMOOTHING_M", 2.0),
                )
            except ValueError as error:
                print(f"AVERTISSEMENT : strate arbustive ignorée ({error}).")
            else:
                if not nappe.is_empty():
                    group = SurfaceGroup()
                    for triangle in surface_triangles(
                        nappe.elevations,
                        xmin,
                        ymax,
                        resolution,
                        centre,
                        base_elevation,
                    ):
                        _append_triangle(group, list(triangle))
                    groups["understory"] = group
                    print(f"Strate arbustive : {nappe.cells} cellules")
    return groups


def _load_occlusion(config: PocConfig, run_dir: Path, grid: object | None):
    """Occlusion cuite de la scène. L'implémentation vit dans ``occlusion.py``.

    Le nuage LiDAR témoin la cuit désormais lui aussi : la fonction a été déplacée pour que
    les deux appelants lisent les mêmes réglages, et cet alias garde le point d'appel local.
    """
    from .occlusion import load_occlusion

    return load_occlusion(config, run_dir, grid)  # type: ignore[arg-type]


def create_scene_glb(config: PocConfig, run_dir: Path | None = None) -> Path:
    import numpy as np

    from .raster import TerrainSampler
    from .roofs import read_roof_quality
    from .sun import measure_ortho_offset, measure_ortho_sun
    from .vegetation import CROWN_IRREGULARITY, CROWN_VERTICES, load_trees

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
        # Ces valeurs sont cuites ici, dans les coordonnées de texture : retoucher le `.conf`
        # ensuite ne changerait rien tant que l'assemblage n'est pas rejoué. Les annoncer est
        # ce qui permet de vérifier, en un coup d'œil, que la retouche a bien été prise.
        print(
            f"Calage de l'orthophotographie : est {offset.east_m:+.2f} m, "
            f"nord {offset.north_m:+.2f} m ({offset.source})"
        )
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
    tints = _foliage_tints(config, run_dir, trees, ortho_path, ortho_offset)
    vegetation = load_vegetation(config, trees, terrain.base_elevation, scene_centre, tints)
    nappes = _load_nappes(config, run_dir, terrain.base_elevation, scene_centre, grid)

    occlusion = _load_occlusion(config, run_dir, grid)
    if occlusion is not None:
        terrain.colors = bake_colors(
            terrain.positions, occlusion, scene_centre, terrain.base_elevation
        )
        for group in (
            terrain.skirt,
            *(group for building in buildings for group in (building.walls, building.roofs)),
            *vegetation.values(),
            *nappes.values(),
        ):
            group.colors = _combine_colors(
                group.colors,
                bake_colors(group.positions, occlusion, scene_centre, terrain.base_elevation),
            )

    builder = GlbBuilder()
    texture = builder.add_texture(ortho_path.read_bytes())
    terrain_material = builder.add_material(
        "Orthophoto IGN", (1.0, 1.0, 1.0, 1.0), roughness=1.0, texture=texture
    )
    # La tranche ne porte pas l'orthophotographie : reprendre les UV du bord y étirait le
    # dernier pixel de l'image sur toute la hauteur, en traînées verticales. Une teinte
    # minérale unie se lit comme une coupe, ce qu'elle est.
    skirt_material = builder.add_material(
        "Tranche", SKIRT_COLOR, roughness=1.0, double_sided=False
    )
    facade_codes = {_facade_code(building.attributes) for building in buildings}
    wall_materials = {
        code: builder.add_material(
            f"Murs — code {code}" if code is not None else "Murs — code non renseigné",
            _wall_color(code),
            roughness=0.9,
            double_sided=False,
        )
        for code in sorted(facade_codes, key=lambda value: (value is None, value or ""))
    }
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
    # Les proxys de végétation sont dépourvus de texture. Un seul matériau suffit : la
    # couleur de chaque arbre voyage dans COLOR_0, échantillonnée sur l'orthophotographie.
    # Le facteur reste blanc pour ne pas teinter deux fois. Un houppier n'est pas fermé au
    # sens strict, d'où le rendu double face.
    foliage_materials = {
        FOLIAGE_GROUP: builder.add_material(
            "Feuillage",
            (1.0, 1.0, 1.0, 1.0) if tints else FOLIAGE_FALLBACK,
            roughness=0.95,
        ),
        TRUNK_GROUP: builder.add_material(
            "Troncs", TRUNK_COLOR, roughness=0.95, double_sided=False
        ),
    }
    # La transparence fond le masque LiDAR dans l'orthophoto et atténue son contour raster.
    # Sa nappe n'est pas fermée et se voit par en dessous depuis l'aval, d'où le double face.
    water_material = builder.add_material(
        "Eau", WATER_COLOR, roughness=0.22, alpha_mode="BLEND"
    )
    bridge_material = builder.add_material(
        "Pont", BRIDGE_COLOR, roughness=0.9, double_sided=False
    )
    if tints:
        mean_tint = np.asarray(tints, dtype=np.float64).mean(axis=0)
        canopy_color = (
            srgb_to_linear(float(mean_tint[0])),
            srgb_to_linear(float(mean_tint[1])),
            srgb_to_linear(float(mean_tint[2])),
            1.0,
        )
    else:
        canopy_color = FOLIAGE_FALLBACK
    canopy_material = builder.add_material("Canopée", canopy_color, roughness=0.95)
    # Double face : la nappe se voit par en dessous depuis une rue en contrebas, comme celle
    # de l'eau, et une strate basse aperçue par sa tranche disparaîtrait en simple face.
    understory_material = builder.add_material(
        "Sous-bois", UNDERSTORY_COLOR, roughness=0.98
    )

    terrain_primitives = [
        builder.primitive(
            terrain.positions,
            terrain.normals,
            terrain.indices,
            terrain_material,
            terrain.uvs,
            terrain.colors,
        )
    ]
    if terrain.skirt.positions:
        terrain_primitives.append(
            builder.primitive(
                terrain.skirt.positions,
                terrain.skirt.normals,
                terrain.skirt.indices,
                skirt_material,
                None,
                terrain.skirt.colors,
            )
        )
    builder.add_mesh("Terrain", terrain_primitives)
    building_nodes = []
    for building in buildings:
        primitives = [
            builder.primitive(
                group.positions, group.normals, group.indices, material, group.uvs, group.colors
            )
            for group, material in (
                (building.walls, wall_materials[_facade_code(building.attributes)]),
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
                    foliage_materials[key],
                    None,
                    group.colors,
                )
                for key, group in sorted(vegetation.items())
                if group.positions
            ],
            # Les houppiers sont fusionnés en une primitive unique : sans ce pas, le
            # visualiseur ne saurait pas où commence et finit chaque arbre, et ne pourrait
            # donc pas les redimensionner autour de leur propre centre.
            extras={"trees": len(trees), "crownVertices": CROWN_VERTICES},
        )
    # Les nappes forment des nœuds distincts : le visualiseur doit pouvoir les masquer
    # séparément, comme le terrain et le bâti, pour isoler un défaut de contact.
    for name, node, material in (
        ("water", "Eau", water_material),
        ("bridge", "Ponts", bridge_material),
        ("massif", "Canopee", canopy_material),
        ("understory", "Sousbois", understory_material),
    ):
        group = nappes.get(name)
        if group and group.positions:
            builder.add_mesh(
                node,
                [
                    builder.primitive(
                        group.positions, group.normals, group.indices, material, None, group.colors
                    )
                ],
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
        # Contrat des deux représentations altimétriques : le terrain est le sol classé 2,
        # tandis que le MNS scientifique ajoute les trois strates végétales et le bâti.
        "bareGroundClasses": [2],
        "surfaceClasses": [2, 3, 4, 5, 6],
        # Côté de l'emprise que couvre l'orthophotographie, marge du terrain comprise. C'est
        # l'échelle qui convertit un calage en mètres vers des coordonnées de texture : sans
        # elle, le visualiseur ne saurait pas de combien décaler l'image pour un mètre demandé.
        "orthoExtentM": config.terrain_bbox[2] - config.terrain_bbox[0],
        "sourceCityJSONSeq": [path.name for path in cityjson_files],
        # Roofer signale lui-même les toitures qu'il n'a pas su reconstruire : sans cette
        # clé, elles se lisent dans la scène comme n'importe quelle toiture mesurée.
        "roofQuality": roof_quality.as_metadata(),
        "lod1Fallbacks": sum(
            1 for building in buildings if building.attributes.get("rf_lod1_fallback") is True
        ),
        "trees": len(trees),
        "bakedOcclusion": occlusion is not None,
        "medianViewFactor": occlusion.median_view_factor if occlusion is not None else None,
        # Le visualiseur active ses bascules d'après ces clés : une emprise sans cours d'eau
        # ne doit pas afficher une case à cocher sans effet.
        "water": "water" in nappes,
        "bridges": "bridge" in nappes,
        "canopy": "massif" in nappes,
        "understory": "understory" in nappes,
        "foliageTinted": bool(tints),
        "foliageKinds": {
            kind: sum(1 for tree in trees if tree.foliage == kind)
            for kind in sorted({tree.foliage for tree in trees})
        },
        # La valeur employée, et non celle par défaut : le relief des houppiers se règle à
        # l'œil d'un run à l'autre, et la scène doit dire lequel elle porte.
        "crownIrregularity": max(
            0.0, config.get_float("VEGETATION_CROWN_IRREGULARITY", CROWN_IRREGULARITY)
        )
        if trees
        else 0.0,
    }
    if roof_quality.degraded:
        print(
            f"AVERTISSEMENT : {len(roof_quality.degraded)} toiture(s) dégradée(s) sur "
            f"{roof_quality.total} ({roof_quality.ratio:.1%}) — voir roofQuality dans scene.json."
        )
    # Le visualiseur en a besoin pour caler son soleil sur les ombres de l'orthophotographie ;
    # un échec de calibration ne doit pas empêcher la production de la scène.
    try:
        sun = measure_ortho_sun(config, run_dir)
        metadata["orthoSun"] = sun.as_metadata()
        print(
            f"Soleil de l'orthophotographie : azimut {sun.azimuth_deg:.0f}°, "
            f"hauteur {sun.elevation_deg:.0f}° ({sun.source})"
        )
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
