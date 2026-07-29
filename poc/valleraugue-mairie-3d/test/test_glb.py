from pathlib import Path
from tempfile import TemporaryDirectory
import json
import struct
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.glb import GlbBuilder, _append_skirt, _newell_normal, load_buildings, load_terrain


class GlbTest(unittest.TestCase):
    def test_ecrit_un_glb_valide(self) -> None:
        with TemporaryDirectory() as directory:
            destination = Path(directory) / "triangle.glb"
            builder = GlbBuilder()
            material = builder.add_material("Test", (1, 0, 0, 1))
            primitive = builder.primitive(
                [(0, 0, 0), (1, 0, 0), (0, 1, 0)],
                [(0, 0, 1)] * 3,
                [0, 1, 2],
                material,
            )
            builder.add_mesh("Triangle", [primitive])
            builder.write(destination)
            magic, version, length = struct.unpack("<4sII", destination.read_bytes()[:12])
            self.assertEqual(magic, b"glTF")
            self.assertEqual(version, 2)
            self.assertEqual(length, destination.stat().st_size)

    def test_distingue_murs_et_toiture(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text('POC_BBOX="0 0 10 10"\n', encoding="utf-8")
            config = PocConfig.load(root, config_file)
            cityjson = root / "model.city.jsonl"
            header = {
                "type": "CityJSON",
                "transform": {"scale": [1, 1, 1], "translate": [0, 0, 0]},
            }
            feature = {
                "type": "CityJSONFeature",
                "vertices": [[0, 0, 0], [2, 0, 0], [2, 2, 2], [0, 2, 2]],
                "CityObjects": {
                    "part": {
                        "geometry": [
                            {
                                "type": "Solid",
                                "lod": "2.2",
                                "boundaries": [[[[0, 1, 2]], [[0, 2, 3]]]],
                                "semantics": {
                                    "surfaces": [
                                        {"type": "WallSurface"},
                                        {"type": "RoofSurface"},
                                    ],
                                    "values": [[0, 1]],
                                },
                            }
                        ]
                    }
                },
            }
            cityjson.write_text(
                json.dumps(header) + "\n" + json.dumps(feature) + "\n",
                encoding="utf-8",
            )
            groups, count = load_buildings(config, cityjson, 0)
            self.assertEqual(count, 1)
            self.assertEqual(len(groups["walls"][2]), 3)
            self.assertEqual(len(groups["roofs"][2]), 3)

    def test_charge_plusieurs_cityjsonseq_et_ignore_un_lod_inferieur(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text('POC_BBOX="0 0 10 10"\n', encoding="utf-8")
            header = {"type": "CityJSON", "transform": {"scale": [1, 1, 1], "translate": [0, 0, 0]}}
            def write_model(path: Path, lod: str) -> None:
                feature = {
                    "vertices": [[0, 0, 0], [2, 0, 0], [0, 2, 0]],
                    "CityObjects": {"part": {"geometry": [{"type": "MultiSurface", "lod": lod, "boundaries": [[[0, 1, 2]]]}]}},
                }
                path.write_text(json.dumps(header) + "\n" + json.dumps(feature) + "\n", encoding="utf-8")
            first, second, ignored = root / "a.city.jsonl", root / "b.city.jsonl", root / "c.city.jsonl"
            write_model(first, "2.2")
            write_model(second, "2.2")
            write_model(ignored, "1.3")
            groups, count = load_buildings(PocConfig.load(root, config_file), [first, second, ignored], 0)
            self.assertEqual(count, 2)
            self.assertEqual(len(groups["walls"][2]), 6)

    def test_charge_directement_la_grille_numpy(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text('POC_BBOX="0 0 2 2"\n', encoding="utf-8")
            terrain = load_terrain(PocConfig.load(root, config_file), grid=np.array([[10.0, 11.0], [12.0, 13.0]]))
            self.assertEqual(len(terrain.positions), 4)
            self.assertEqual(len(terrain.indices), 6)
            self.assertEqual(terrain.base_elevation, 10)

    def test_place_l_origine_des_uv_au_nord_ouest(self) -> None:
        """glTF place (0, 0) au coin supérieur gauche de la texture, soit le nord-ouest.

        Une inversion de v applique l'orthophotographie retournée sur le terrain.
        """
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text(
                'POC_BBOX="0 0 2 2"\nTERRAIN_MARGIN_M=0\n', encoding="utf-8"
            )
            config = PocConfig.load(root, config_file)
            grid = np.array([[10.0, 11.0], [12.0, 13.0]])
            terrain = load_terrain(config, grid=grid)
            for position, uv in zip(terrain.positions, terrain.uvs):
                # Z du repère GLB croît vers le sud : v doit croître avec lui.
                north = position[2] < 0
                self.assertEqual(north, uv[1] < 0.5, f"{position} -> {uv}")
                west = position[0] < 0
                self.assertEqual(west, uv[0] < 0.5, f"{position} -> {uv}")

    def test_oriente_les_jupes_d_un_contour_concave_selon_newell(self) -> None:
        vertices = [
            (0.0, 0.0, 0.0), (3.0, 0.0, 0.0), (3.0, 0.0, 3.0),
            (1.0, 0.0, 3.0), (1.0, 0.0, 1.0), (0.0, 0.0, 1.0),
        ]
        ring = [0, 1, 2, 3, 4, 5]
        group: tuple[list, list, list] = ([], [], [])
        _append_skirt(group, vertices, ring, 2.0)
        normal = _newell_normal(vertices, ring)
        for edge_index, (first, second) in enumerate(zip(ring, ring[1:] + ring[:1])):
            edge = tuple(vertices[second][axis] - vertices[first][axis] for axis in range(3))
            expected = (
                edge[1] * normal[2] - edge[2] * normal[1],
                edge[2] * normal[0] - edge[0] * normal[2],
                edge[0] * normal[1] - edge[1] * normal[0],
            )
            emitted = group[1][edge_index * 6]
            self.assertGreater(sum(emitted[axis] * expected[axis] for axis in range(3)), 0)


if __name__ == "__main__":
    unittest.main()
