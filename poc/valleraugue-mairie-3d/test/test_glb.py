from pathlib import Path
from tempfile import TemporaryDirectory
import json
import math
import struct
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.glb import (
    GlbBuilder,
    SurfaceGroup,
    _append_skirt,
    _face_triangles,
    _newell_normal,
    _palette_index,
    _facade_code,
    _skirt_depth,
    _srgb,
    _wall_color,
    bake_colors,
    load_buildings,
    load_terrain,
    load_vegetation,
    ortho_uv,
    ortho_uv_projector,
)
from poc3d.raster import TerrainSampler


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

    def test_declare_une_eau_translucide_sans_seuil_alpha(self) -> None:
        builder = GlbBuilder()
        ortho = builder.add_texture(b"ortho")
        material = builder.add_material(
            "Eau",
            (0.2, 0.3, 0.4, 0.58),
            alpha_mode="BLEND",
        )
        self.assertEqual(builder.textures[ortho]["sampler"], 0)
        self.assertEqual(builder.samplers[0]["wrapS"], 33071)
        self.assertEqual(builder.materials[material]["alphaMode"], "BLEND")
        self.assertNotIn("alphaCutoff", builder.materials[material])
        self.assertEqual(
            builder.materials[material]["pbrMetallicRoughness"]["baseColorFactor"][3],
            0.58,
        )

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
            buildings = load_buildings(config, cityjson, 0)
            self.assertEqual(len(buildings), 1)
            self.assertEqual(len(buildings[0].walls.indices), 3)
            self.assertEqual(len(buildings[0].roofs.indices), 3)
            # Sans UV, aucun matériau tuilé n'est applicable au bâti en aval.
            self.assertEqual(len(buildings[0].roofs.uvs), 3)

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
            buildings = load_buildings(PocConfig.load(root, config_file), [first, second, ignored], 0)
            self.assertEqual(len(buildings), 2)
            self.assertEqual(sum(len(building.walls.indices) for building in buildings), 6)

    def test_charge_directement_la_grille_numpy(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text(
                'POC_BBOX="0 0 2 2"\nTERRAIN_EDGE_SKIRT_M=0\n', encoding="utf-8"
            )
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
                'POC_BBOX="0 0 2 2"\nTERRAIN_MARGIN_M=0\nTERRAIN_EDGE_SKIRT_M=0\n',
                encoding="utf-8",
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
        group = SurfaceGroup()
        _append_skirt(group, vertices, ring, 2.0)
        normal = _newell_normal(vertices, ring)
        for edge_index, (first, second) in enumerate(zip(ring, ring[1:] + ring[:1])):
            edge = tuple(vertices[second][axis] - vertices[first][axis] for axis in range(3))
            expected = (
                edge[1] * normal[2] - edge[2] * normal[1],
                edge[2] * normal[0] - edge[0] * normal[2],
                edge[0] * normal[1] - edge[1] * normal[0],
            )
            emitted = group.normals[edge_index * 6]
            self.assertGreater(sum(emitted[axis] * expected[axis] for axis in range(3)), 0)


class DegradedRoofLod1Test(unittest.TestCase):
    def _load(self, root: Path, roof_type: str, extra: str = "") -> object:
        config_file = root / "poc.conf"
        config_file.write_text(
            f'POC_BBOX="0 0 10 10"\nTERRAIN_MARGIN_M=0\n{extra}', encoding="utf-8"
        )
        cityjson = root / "model.city.jsonl"
        header = {
            "type": "CityJSON",
            "transform": {"scale": [1, 1, 1], "translate": [0, 0, 0]},
        }
        feature = {
            "type": "CityJSONFeature",
            "id": "batiment-test",
            "vertices": [
                [2, 2, 0],
                [8, 2, 0],
                [8, 8, 0],
                [2, 8, 0],
                [2, 2, 4],
                [8, 2, 8],
                [8, 8, 8],
                [2, 8, 4],
            ],
            "CityObjects": {
                "part": {
                    "attributes": {"rf_roof_type": roof_type, "hauteur": 6},
                    "geometry": [
                        {
                            "type": "MultiSurface",
                            "lod": "2.2",
                            "boundaries": [
                                [[0, 1, 2, 3]],
                                [[0, 4, 5, 1]],
                                [[4, 5, 6, 7]],
                            ],
                            "semantics": {
                                "surfaces": [
                                    {"type": "GroundSurface"},
                                    {"type": "WallSurface"},
                                    {"type": "RoofSurface"},
                                ],
                                "values": [0, 1, 2],
                            },
                        }
                    ],
                }
            },
        }
        cityjson.write_text(
            json.dumps(header) + "\n" + json.dumps(feature) + "\n", encoding="utf-8"
        )
        return load_buildings(PocConfig.load(root, config_file), cityjson, 0)[0]

    def test_remplace_une_toiture_degradee_par_un_volume_lod1(self) -> None:
        with TemporaryDirectory() as directory:
            building = self._load(Path(directory), "unknown")
            self.assertEqual({point[1] for point in building.roofs.positions}, {6.0})
            self.assertTrue(building.attributes["rf_lod1_fallback"])
            self.assertEqual(building.attributes["rf_rendered_lod"], "1")
            self.assertEqual(building.attributes["rf_lod1_height_source"], "hauteur")

    def test_conserve_le_lod22_d_une_toiture_fiable(self) -> None:
        with TemporaryDirectory() as directory:
            building = self._load(Path(directory), "slanted")
            self.assertEqual({point[1] for point in building.roofs.positions}, {4.0, 8.0})
            self.assertNotIn("rf_lod1_fallback", building.attributes)

    def test_permet_de_desactiver_le_repli_lod1(self) -> None:
        with TemporaryDirectory() as directory:
            building = self._load(Path(directory), "unknown", "DEGRADED_ROOF_LOD1=0\n")
            self.assertEqual({point[1] for point in building.roofs.positions}, {4.0, 8.0})
            self.assertNotIn("rf_lod1_fallback", building.attributes)


class SrgbTest(unittest.TestCase):
    """``baseColorFactor`` est linéaire : une conversion inversée délave toute la scène."""

    def test_conserve_les_extremes(self) -> None:
        self.assertEqual(_srgb("#FFFFFF"), (1.0, 1.0, 1.0, 1.0))
        self.assertEqual(_srgb("#000000"), (0.0, 0.0, 0.0, 1.0))

    def test_assombrit_les_valeurs_intermediaires(self) -> None:
        # Le gris moyen sRGB vaut 21,6 % de luminance linéaire, pas 50 % : c'est tout
        # l'écart qui rendait les murs quasi blancs.
        for channel in _srgb("#808080")[:3]:
            self.assertAlmostEqual(channel, 0.2158605, places=6)

    def test_accepte_le_croisillon_optionnel(self) -> None:
        self.assertEqual(_srgb("4E6B3A"), _srgb("#4E6B3A"))

    def test_reporte_l_alpha(self) -> None:
        self.assertEqual(_srgb("#FFFFFF", 0.25)[3], 0.25)

    def test_refuse_une_teinte_mal_formee(self) -> None:
        for invalid in ("#FFF", "#GGGGGG", ""):
            with self.assertRaises(ValueError):
                _srgb(invalid)


class WallColorTest(unittest.TestCase):
    def test_normalise_le_code_facade(self) -> None:
        self.assertEqual(_facade_code({"materiaux_des_murs": " 20 "}), "20")
        self.assertEqual(_facade_code({"materiaux_des_murs": ["10", "20"]}), "10,20")
        self.assertIsNone(_facade_code({"materiaux_des_murs": None}))
        self.assertIsNone(_facade_code({}))

    def test_lie_la_nuance_au_code_et_non_au_batiment(self) -> None:
        self.assertEqual(_wall_color("20"), _wall_color("20"))
        self.assertNotEqual(_wall_color("20"), _wall_color("10"))
        self.assertNotEqual(_wall_color("20"), _wall_color(None))

    def test_garde_des_ecarts_discrets_autour_de_la_teinte_neutre(self) -> None:
        neutral = _wall_color(None)
        for code in ("01", "02", "10", "13", "14", "20", "30", "50"):
            for channel, reference in zip(_wall_color(code)[:3], neutral[:3]):
                self.assertLess(abs(channel - reference), 0.04)


class TerrainSkirtTest(unittest.TestCase):
    def _terrain(self, skirt: str) -> object:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text(
                f'POC_BBOX="0 0 3 3"\nTERRAIN_MARGIN_M=0\nTERRAIN_EDGE_SKIRT_M={skirt}\n',
                encoding="utf-8",
            )
            grid = np.array([[10.0, 11.0, 12.0], [13.0, 14.0, 15.0], [16.0, 17.0, 18.0]])
            return load_terrain(PocConfig.load(root, config_file), grid=grid)

    def test_ferme_le_contour_du_terrain(self) -> None:
        """La tranche de la dalle doit être masquée par une jupe verticale continue."""
        plain = self._terrain("0")
        skirted = self._terrain("12")
        # La jupe est un groupe distinct : la nappe texturée n'en reçoit aucun sommet.
        self.assertEqual(len(skirted.positions), len(plain.positions))
        self.assertEqual(len(skirted.uvs), len(skirted.positions))
        self.assertFalse(plain.skirt.positions)
        # Quatre arêtes de contour par côté d'une grille 3 × 3, quatre sommets chacune.
        self.assertEqual(len(skirted.skirt.positions), 8 * 4)
        self.assertEqual(len(skirted.skirt.indices), 8 * 6)
        self.assertEqual(len(skirted.skirt.normals), len(skirted.skirt.positions))
        # La jupe ne porte pas l'orthophotographie : sans UV, aucun pixel n'est étiré.
        self.assertFalse(skirted.skirt.uvs)

    def test_suit_le_relief_plutot_qu_une_altitude_commune(self) -> None:
        """Un fond unique creuserait une falaise à la hauteur de toute la dénivelée."""
        skirted = self._terrain("12")
        tops = {
            (position[0], position[2]): position[1]
            for position in skirted.positions
        }
        depths = [
            round(tops[(position[0], position[2])] - position[1], 6)
            for position in skirted.skirt.positions
            if (position[0], position[2]) in tops
        ]
        # Chaque sommet de jupe est soit sur le bord, soit exactement 12 m dessous.
        self.assertEqual(set(depths), {0.0, 12.0})
        # La grille monte de 10 à 18 : un fond absolu descendrait ici à 20 m sous la crête.
        span = max(position[1] for position in skirted.skirt.positions) - min(
            position[1] for position in skirted.skirt.positions
        )
        self.assertAlmostEqual(span, skirted.max_elevation - skirted.min_elevation + 12)

    def test_ignore_une_jupe_nulle_ou_negative(self) -> None:
        self.assertFalse(self._terrain("-4").skirt.positions)
        self.assertFalse(self._terrain("0").skirt.positions)


class SkirtDepthTest(unittest.TestCase):
    def _config(self, root: Path) -> PocConfig:
        config_file = root / "poc.conf"
        config_file.write_text(
            'POC_BBOX="0 0 10 10"\nTERRAIN_MARGIN_M=0\n'
            "BUILDING_SKIRT_MIN_M=1\nBUILDING_SKIRT_MAX_M=8\n",
            encoding="utf-8",
        )
        return PocConfig.load(root, config_file)

    def _depth(self, ground: float) -> float:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(root)
            sampler = TerrainSampler(np.full((10, 10), ground), 0.0, 10.0, 1.0)
            # Contour de 2 m de côté au centre de l'emprise, plancher à 20 m.
            vertices = [(-1.0, 20.0, -1.0), (1.0, 20.0, -1.0), (1.0, 20.0, 1.0), (-1.0, 20.0, 1.0)]
            return _skirt_depth(config, sampler, vertices, [0, 1, 2, 3], 0.0, (5.0, 5.0))

    def test_allonge_la_jupe_avec_la_denivelee(self) -> None:
        """Une jupe fixe laisse le bâtiment flotter dès que le terrain décroche."""
        self.assertLess(self._depth(19.0), self._depth(16.0))

    def test_borne_la_jupe_par_le_minimum_et_le_maximum(self) -> None:
        self.assertEqual(self._depth(20.0), 1.0)
        self.assertEqual(self._depth(0.0), 8.0)

    def test_retombe_sur_la_valeur_fixe_sans_terrain(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(root)
            vertices = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (1.0, 0.0, 1.0)]
            self.assertEqual(_skirt_depth(config, None, vertices, [0, 1, 2], 0.0, (5.0, 5.0)), 2.0)


class RoofTextureTest(unittest.TestCase):
    """L'orthophotographie contient déjà les toitures réelles : mieux vaut les y projeter."""

    def _load(self, root: Path, extra: str) -> list:
        config_file = root / "poc.conf"
        config_file.write_text(
            f'POC_BBOX="0 0 10 10"\nTERRAIN_MARGIN_M=0\n{extra}', encoding="utf-8"
        )
        cityjson = root / "model.city.jsonl"
        header = {"type": "CityJSON", "transform": {"scale": [1, 1, 1], "translate": [0, 0, 0]}}
        feature = {
            # Sommets Lambert-93 : nord-ouest, nord-est puis sud-est de l'emprise.
            "vertices": [[0, 10, 5], [10, 10, 5], [10, 0, 5]],
            "CityObjects": {
                "part": {
                    "geometry": [
                        {
                            "type": "MultiSurface",
                            "lod": "2.2",
                            "boundaries": [[[0, 1, 2]], [[0, 1, 2]]],
                            "semantics": {
                                "surfaces": [{"type": "RoofSurface"}, {"type": "WallSurface"}],
                                "values": [0, 1],
                            },
                        }
                    ]
                }
            },
        }
        cityjson.write_text(
            json.dumps(header) + "\n" + json.dumps(feature) + "\n", encoding="utf-8"
        )
        return load_buildings(PocConfig.load(root, config_file), cityjson, 0)

    def test_projette_les_toitures_sur_l_orthophoto(self) -> None:
        with TemporaryDirectory() as directory:
            buildings = self._load(Path(directory), "")
            uvs = buildings[0].roofs.uvs
            # glTF place l'origine des UV au nord-ouest, comme pour le terrain.
            self.assertEqual(uvs[0], (0.0, 0.0))
            self.assertEqual(uvs[1], (1.0, 0.0))
            self.assertEqual(uvs[2], (1.0, 1.0))

    def test_conserve_des_uv_metriques_sur_les_murs(self) -> None:
        with TemporaryDirectory() as directory:
            buildings = self._load(Path(directory), "")
            # Une unité UV vaut un mètre : l'emprise de 10 m dépasse largement [0, 1].
            self.assertGreater(max(uv[0] for uv in buildings[0].walls.uvs), 1.0)

    def test_applique_le_meme_calage_au_terrain_et_aux_toitures(self) -> None:
        """Un signe divergent entre les deux passerait inaperçu : ils partagent la fonction."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text(
                'POC_BBOX="0 0 10 10"\nTERRAIN_MARGIN_M=0\n', encoding="utf-8"
            )
            config = PocConfig.load(root, config_file)
            # Emprise de 10 m : un calage de 2 m vers le sud vaut 0,2 en UV.
            offset = (1.0, -2.0)
            terrain_uv = ortho_uv(config, offset)
            roof_uv = ortho_uv_projector(config, (5.0, 5.0), offset)
            # Même point Lambert-93 (5, 5), atteint par les deux chemins.
            self.assertEqual(roof_uv((0.0, 12.0, 0.0), (0.0, 1.0, 0.0)), terrain_uv(5.0, 5.0))
            # Un calage vers le sud fait croître v, vers l'est fait croître u.
            self.assertAlmostEqual(terrain_uv(5.0, 5.0)[0] - ortho_uv(config)(5.0, 5.0)[0], 0.1)
            self.assertAlmostEqual(terrain_uv(5.0, 5.0)[1] - ortho_uv(config)(5.0, 5.0)[1], 0.2)

    def test_la_projection_des_toitures_ignore_la_hauteur(self) -> None:
        """Le calage mesuré est constant : il ne doit pas dépendre de l'altitude du sommet."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text(
                'POC_BBOX="0 0 10 10"\nTERRAIN_MARGIN_M=0\n', encoding="utf-8"
            )
            project = ortho_uv_projector(PocConfig.load(root, config_file), (5.0, 5.0), (1.0, -2.0))
            normal = (0.0, 1.0, 0.0)
            self.assertEqual(project((2.0, 0.0, 3.0), normal), project((2.0, 25.0, 3.0), normal))

    def test_repli_en_uv_planaires_si_la_texture_est_desactivee(self) -> None:
        with TemporaryDirectory() as directory:
            buildings = self._load(Path(directory), "ROOF_TEXTURE_FROM_ORTHO=0\n")
            self.assertGreater(max(uv[0] for uv in buildings[0].roofs.uvs), 1.0)


class FaceTriangulationTest(unittest.TestCase):
    """Le repli en éventail était silencieux : on ignorait s'il faussait des toitures."""

    def test_ne_signale_rien_sur_une_face_saine(self) -> None:
        points = [(0, 0, 0), (3, 0, 0), (3, 3, 0), (1, 3, 0), (1, 1, 0), (0, 1, 0)]
        triangles, degraded = _face_triangles(points, [[0, 1, 2, 3, 4, 5]])
        self.assertFalse(degraded)
        self.assertEqual(len(triangles), 4)

    def test_abandonne_et_signale_une_face_concave_intriangulable(self) -> None:
        # Contour concave replié sur lui-même : le découpage d'oreilles échoue.
        points = [(0, 0, 0), (2, 0, 0), (0, 1, 0), (2, 1, 0)]
        triangles, degraded = _face_triangles(points, [[0, 1, 2, 3]])
        self.assertTrue(degraded)
        self.assertEqual(triangles, [])

    def test_signale_une_face_degeneree(self) -> None:
        triangles, degraded = _face_triangles([(0, 0, 0), (1, 0, 0)], [[0, 1]])
        self.assertTrue(degraded)
        self.assertEqual(triangles, [])


class BakedOcclusionTest(unittest.TestCase):
    """L'occlusion voyage dans la géométrie : tout moteur glTF la restitue sans passe dédiée."""

    def test_ecrit_color_0_quand_des_couleurs_sont_fournies(self) -> None:
        builder = GlbBuilder()
        material = builder.add_material("Test", (1, 1, 1, 1))
        primitive = builder.primitive(
            [(0, 0, 0), (1, 0, 0), (0, 1, 0)],
            [(0, 1, 0)] * 3,
            [0, 1, 2],
            material,
            colors=[(0.5, 0.5, 0.5, 1.0)] * 3,
        )
        self.assertIn("COLOR_0", primitive["attributes"])

    def test_n_ecrit_rien_sans_occlusion(self) -> None:
        builder = GlbBuilder()
        material = builder.add_material("Test", (1, 1, 1, 1))
        primitive = builder.primitive(
            [(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 0)] * 3, [0, 1, 2], material
        )
        self.assertNotIn("COLOR_0", primitive["attributes"])

    def test_convertit_les_sommets_glb_vers_le_repere_lambert(self) -> None:
        """X vers l'est, Z vers le sud, Y au-dessus de la base : trois conventions à croiser."""

        class Recorder:
            def at(self, x, y, elevation):
                self.seen = (float(x[0]), float(y[0]), float(elevation[0]))
                return np.array([0.5])

        recorder = Recorder()
        colors = bake_colors([(10.0, 5.0, 4.0)], recorder, (751000.0, 6331000.0), 300.0)
        self.assertEqual(recorder.seen, (751010.0, 6330996.0, 305.0))
        self.assertEqual(colors, [(0.5, 0.5, 0.5, 1.0)])


class VegetationNodeTest(unittest.TestCase):
    def test_groupe_les_arbres_par_teinte_de_feuillage(self) -> None:
        from poc3d.vegetation import Tree

        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text('POC_BBOX="0 0 100 100"\n', encoding="utf-8")
            config = PocConfig.load(root, config_file)
            trees = [Tree(x=10.0 * index, y=20.0, ground=0.0, height=9.0, crown=2.0) for index in range(6)]
            groups = load_vegetation(config, trees, 0.0, (50.0, 50.0))
            # Un groupe de troncs, plus autant de groupes que de teintes effectivement tirées.
            self.assertGreaterEqual(len(groups), 2)
            self.assertEqual(sum(len(group.indices) for group in groups.values()), 6 * (20 + 8) * 3)

    def test_ne_produit_aucun_groupe_sans_arbre(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text('POC_BBOX="0 0 100 100"\n', encoding="utf-8")
            self.assertEqual(load_vegetation(PocConfig.load(root, config_file), [], 0.0, (50.0, 50.0)), {})

    def test_cuit_un_ombrage_facette_pour_le_feuillage(self) -> None:
        """La recette a retenu le houppier facetté : il se lit comme une représentation.

        Le lissage radial essayé ensuite donnait une bulle — un solide de douze sommets dont
        l'intérieur se prétend rond mais dont la silhouette reste anguleuse. Il est resté au
        visualiseur, où il se compare sans réassembler la scène ; le GLB, lui, écrit une
        normale par face, ici comme partout ailleurs.
        """
        from poc3d.glb import FOLIAGE_GROUP
        from poc3d.vegetation import Tree

        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text('POC_BBOX="0 0 100 100"\n', encoding="utf-8")
            tree = Tree(x=32.0, y=71.0, ground=4.0, height=9.0, crown=2.0)
            groups = load_vegetation(
                PocConfig.load(root, config_file), [tree], 0.0, (50.0, 50.0)
            )
            foliage = groups[FOLIAGE_GROUP]
            self.assertEqual(len(foliage.positions), 60)
            # Vingt faces, donc vingt directions : les trois sommets d'un triangle partagent
            # la leur, et deux faces voisines ne la partagent pas.
            self.assertEqual(len(set(foliage.normals)), 20)
            for face in range(20):
                self.assertEqual(len(set(foliage.normals[face * 3 : face * 3 + 3])), 1)
            for normal in foliage.normals:
                self.assertAlmostEqual(math.dist(normal, (0.0, 0.0, 0.0)), 1.0, places=6)


class UnderstoryNappeTest(unittest.TestCase):
    """Le chargement de la strate arbustive dans la scène assemblée."""

    def _config(self, root: Path, extra: str = "") -> PocConfig:
        config_file = root / "poc.conf"
        config_file.write_text(
            'POC_BBOX="0 0 20 20"\nTERRAIN_MARGIN_M=0\nTERRAIN_RESOLUTION_M=1\n'
            "VEGETATION_MIN_HEIGHT_M=4\n" + extra,
            encoding="utf-8",
        )
        return PocConfig.load(root, config_file)

    def test_charge_la_nappe_en_groupe_distinct(self) -> None:
        from poc3d.glb import _load_nappes

        with TemporaryDirectory() as directory:
            root = Path(directory)
            run_dir = root / "run-test"
            run_dir.mkdir()
            understory = np.full((20, 20), np.nan)
            understory[4:16, 4:16] = 1.5
            np.save(run_dir / "understory.npy", understory)
            groups = _load_nappes(
                self._config(root), run_dir, 0.0, (10.0, 10.0), np.full((20, 20), 300.0)
            )
            self.assertIn("understory", groups)
            self.assertTrue(groups["understory"].positions)

    def test_une_execution_anterieure_reste_exploitable(self) -> None:
        """Sans `understory.npy`, la scène doit se produire sans la strate, pas échouer."""
        from poc3d.glb import _load_nappes

        with TemporaryDirectory() as directory:
            root = Path(directory)
            run_dir = root / "run-test"
            run_dir.mkdir()
            groups = _load_nappes(
                self._config(root), run_dir, 0.0, (10.0, 10.0), np.full((20, 20), 300.0)
            )
            self.assertNotIn("understory", groups)

    def test_le_reglage_ecarte_la_nappe(self) -> None:
        from poc3d.glb import _load_nappes

        with TemporaryDirectory() as directory:
            root = Path(directory)
            run_dir = root / "run-test"
            run_dir.mkdir()
            understory = np.full((20, 20), np.nan)
            understory[4:16, 4:16] = 1.5
            np.save(run_dir / "understory.npy", understory)
            groups = _load_nappes(
                self._config(root, "UNDERSTORY=0\n"),
                run_dir,
                0.0,
                (10.0, 10.0),
                np.full((20, 20), 300.0),
            )
            self.assertNotIn("understory", groups)

    def test_une_grille_desaccordee_ne_fait_pas_echouer_la_scene(self) -> None:
        from poc3d.glb import _load_nappes

        with TemporaryDirectory() as directory:
            root = Path(directory)
            run_dir = root / "run-test"
            run_dir.mkdir()
            np.save(run_dir / "understory.npy", np.full((8, 8), 1.5))
            groups = _load_nappes(
                self._config(root), run_dir, 0.0, (10.0, 10.0), np.full((20, 20), 300.0)
            )
            self.assertNotIn("understory", groups)


class PaletteTest(unittest.TestCase):
    def test_attribue_une_teinte_stable(self) -> None:
        """Un bâtiment doit garder sa couleur d'une génération de scène à l'autre."""
        self.assertEqual(_palette_index("BATIMENT0000000314552737", 5),
                         _palette_index("BATIMENT0000000314552737", 5))
        self.assertLess(_palette_index("BATIMENT0000000314552737", 5), 5)


if __name__ == "__main__":
    unittest.main()
