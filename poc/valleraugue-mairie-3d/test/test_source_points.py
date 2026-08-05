from pathlib import Path
from tempfile import TemporaryDirectory
import json
import struct
import sys
import unittest

import laspy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.source_points import (
    FOLIAGE_CLASSES,
    FOLIAGE_HUE_RANGE,
    FOLIAGE_MINIMUM_SATURATION,
    _greened,
    _intensity_channel,
    _rgb_to_hsv,
    _sample_indices,
    _voxel_indices,
    create_source_points,
)


def _glb_json(path: Path) -> dict:
    payload = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", payload)
    if magic != b"glTF" or version != 2 or length != len(payload):
        raise AssertionError("GLB invalide")
    json_length, chunk_type = struct.unpack_from("<I4s", payload, 12)
    if chunk_type != b"JSON":
        raise AssertionError("Premier chunk GLB inattendu")
    return json.loads(payload[20 : 20 + json_length])


def _glb_attribute(path: Path, name: str) -> np.ndarray:
    """Relit un attribut de sommet du GLB, en octets et par groupes de quatre.

    `COLOR_0` et `_LIDAR` partagent ce format : les comparer point par point est le seul
    moyen de vérifier qu'une correction ne vise que les classes qu'elle prétend viser.
    """
    document = _glb_json(path)
    primitive = document["meshes"][0]["primitives"][0]
    accessor = document["accessors"][primitive["attributes"][name]]
    view = document["bufferViews"][accessor["bufferView"]]
    payload = path.read_bytes()
    binary = payload.index(b"BIN\x00") + 4
    return np.frombuffer(
        payload, dtype=np.uint8, count=view["byteLength"], offset=binary + view["byteOffset"]
    ).reshape(-1, 4)


def _clustered_cloud() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Nuage volontairement déséquilibré : une grappe dense et une nappe étalée.

    C'est la situation que la décimation dans l'ordre du fichier gère mal — un côté de
    l'emprise y garde toute sa densité pendant que l'autre se vide.
    """
    generator = np.random.default_rng(12345)
    dense_x = generator.uniform(0.0, 2.0, 4000)
    dense_y = generator.uniform(0.0, 2.0, 4000)
    sparse_x = generator.uniform(8.0, 20.0, 400)
    sparse_y = generator.uniform(8.0, 20.0, 400)
    x = np.concatenate([dense_x, sparse_x])
    y = np.concatenate([dense_y, sparse_y])
    z = np.zeros(x.size)
    classification = np.full(x.size, 2, dtype=np.uint8)
    classification[:12] = 17
    return x, y, z, classification


class SourcePointsTest(unittest.TestCase):
    def test_echantillonne_toutes_les_classes_de_facon_stable(self) -> None:
        classes = np.array([2] * 50 + [3] * 20 + [4] * 10 + [5] * 8 + [6] * 5 + [9], dtype=np.uint8)
        first = _sample_indices(classes, 12)
        second = _sample_indices(classes, 12)
        np.testing.assert_array_equal(first, second)
        self.assertEqual(set(classes[first]), set(np.unique(classes)))

    def test_le_voxel_repartit_mieux_la_densite_que_l_ordre_du_fichier(self) -> None:
        """Le nuage doit se lire comme une surface, ce qui suppose une densité étale : un
        échantillon pris dans l'ordre du fichier garde la grappe et vide la nappe."""
        x, y, z, classification = _clustered_cloud()
        budget = 300

        voxel, step = _voxel_indices(x, y, z, classification, 0.2, budget)
        ordered = _sample_indices(classification, budget)

        def dispersion(indices: np.ndarray) -> float:
            cells = np.unique(np.stack((x[indices] // 2, y[indices] // 2), axis=1), axis=0)
            counts = np.array(
                [
                    int(((x[indices] // 2 == cell[0]) & (y[indices] // 2 == cell[1])).sum())
                    for cell in cells
                ]
            )
            return float(counts.std() / counts.mean())

        self.assertLessEqual(voxel.size, budget)
        self.assertGreater(step, 0.2, "la grille doit s'élargir pour tenir le budget")
        self.assertLess(dispersion(voxel), dispersion(ordered))

    def test_le_voxel_conserve_les_classes_rares_et_reste_reproductible(self) -> None:
        x, y, z, classification = _clustered_cloud()
        first, _ = _voxel_indices(x, y, z, classification, 0.2, 900)
        second, _ = _voxel_indices(x, y, z, classification, 0.2, 900)
        np.testing.assert_array_equal(first, second)
        self.assertEqual(set(classification[first].tolist()), {2, 17})

    def test_le_voxel_refuse_un_budget_sous_le_nombre_de_classes(self) -> None:
        x, y, z, classification = _clustered_cloud()
        with self.assertRaisesRegex(ValueError, "SOURCE_POINT_LIMIT"):
            _voxel_indices(x, y, z, classification, 0.2, 1)

    def test_l_intensite_se_cadre_sur_ses_centiles(self) -> None:
        """Une seule mesure aberrante ne doit pas écraser toute l'échelle : c'est le cas réel
        du LiDAR HD, dont la médiane vaut le quart du maximum."""
        values = np.concatenate([np.linspace(800, 1400, 999), np.array([60000.0])])
        channel, (low, high) = _intensity_channel(values)
        self.assertLess(high, 1400)
        self.assertGreater(low, 800)
        # L'aberration sature l'échelle au lieu de la dilater : la médiane reste au milieu.
        self.assertEqual(int(channel[-1]), 255)
        self.assertAlmostEqual(int(channel[499]), 127, delta=4)

    def test_l_intensite_supporte_une_mesure_constante(self) -> None:
        channel, (low, high) = _intensity_channel(np.full(50, 700))
        self.assertEqual(low, high)
        self.assertTrue(np.all(channel == 0))

    def _prepare_run(self, root: Path, extra: str = "", ortho: bool = False) -> tuple[Path, Path]:
        config_file = root / "scene.conf"
        config_file.write_text(
            'POC_BBOX="0 0 2 2"\n'
            "EXPECTED_WIDTH_M=2\nEXPECTED_HEIGHT_M=2\n"
            "TERRAIN_MARGIN_M=0\nSOURCE_POINT_LIMIT=6\n" + extra,
            encoding="utf-8",
        )
        run_dir = root / "run-test"
        run_dir.mkdir()
        header = laspy.LasHeader(point_format=3, version="1.2")
        cloud = laspy.LasData(header)
        cloud.x = np.linspace(0.1, 1.9, 12)
        cloud.y = np.linspace(0.1, 1.9, 12)
        cloud.z = np.linspace(100.0, 111.0, 12)
        cloud.classification = np.array([2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 9], dtype=np.uint8)
        cloud.intensity = np.linspace(100, 900, 12).astype(np.uint16)
        cloud.write(run_dir / "lidar_subset.laz")
        np.save(run_dir / "terrain.npy", np.array([[100.2, 101.0], [102.0, 103.0]]))
        (run_dir / "pdal_pipeline.json").write_text(
            json.dumps(
                [
                    {
                        "type": "readers.copc",
                        "filename": {"path": "https://example.test/tile.copc.laz"},
                    }
                ]
            ),
            encoding="utf-8",
        )
        if ortho:
            from PIL import Image

            # Une image franchement rouge : la couleur assemblée doit s'en distinguer sans
            # ambiguïté de la palette de classes, qui n'a rien d'aussi saturé.
            Image.new("RGB", (16, 16), (255, 0, 0)).save(run_dir / "orthophoto.jpg")
        return config_file, run_dir

    def test_produit_un_glb_points_et_sa_tracabilite(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file, run_dir = self._prepare_run(root, "SOURCE_POINT_VOXEL_M=0\n")

            glb_path, metadata_path = create_source_points(
                PocConfig.load(root, config_file), run_dir
            )
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            document = _glb_json(glb_path)
            primitive = document["meshes"][0]["primitives"][0]
            color_accessor = document["accessors"][primitive["attributes"]["COLOR_0"]]

            self.assertEqual(primitive["mode"], 0)
            self.assertEqual(color_accessor["componentType"], 5121)
            self.assertTrue(color_accessor["normalized"])
            self.assertEqual(metadata["sourcePoints"], 12)
            self.assertEqual(metadata["renderedPoints"], 6)
            self.assertEqual(metadata["voxelM"], 0)
            self.assertTrue(metadata["decimated"])
            self.assertEqual(metadata["copcSources"], ["https://example.test/tile.copc.laz"])
            self.assertEqual(metadata["epsg"], 2154)
            self.assertEqual(len(metadata["sourceSha256"]), 64)
            self.assertEqual(set(metadata["renderedClassificationCounts"]), {"2", "3", "4", "5", "6", "9"})

    def test_transporte_classification_intensite_et_occlusion(self) -> None:
        """Les trois signaux dérivés voyagent dans un attribut applicatif à quatre canaux :
        glTF impose d'aligner les éléments d'attribut sur quatre octets, un scalaire ne
        serait pas conforme, et le visualiseur en tire ses modes de couleur."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file, run_dir = self._prepare_run(root)
            glb_path, metadata_path = create_source_points(
                PocConfig.load(root, config_file), run_dir
            )
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            document = _glb_json(glb_path)
            primitive = document["meshes"][0]["primitives"][0]

            self.assertIn("_LIDAR", primitive["attributes"])
            accessor = document["accessors"][primitive["attributes"]["_LIDAR"]]
            self.assertEqual(accessor["componentType"], 5121)
            self.assertEqual(accessor["type"], "VEC4")
            self.assertFalse(accessor.get("normalized", False))
            self.assertEqual(
                accessor["count"], document["accessors"][primitive["attributes"]["POSITION"]]["count"]
            )
            self.assertEqual(
                metadata["pointAttributes"],
                ["classification", "intensity", "occlusion", "reserved"],
            )
            self.assertGreater(metadata["spacingM"], 0)

    def test_recolorise_depuis_l_orthophotographie(self) -> None:
        """Sur une photographie franchement rouge, la couleur assemblée doit la suivre —
        sauf pour la végétation, que la contrainte de teinte ramène dans les verts."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file, run_dir = self._prepare_run(root, ortho=True)
            glb_path, metadata_path = create_source_points(
                PocConfig.load(root, config_file), run_dir
            )
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["bakedColorMode"], "ortho")

            colors = _glb_attribute(glb_path, "COLOR_0")
            classes = _glb_attribute(glb_path, "_LIDAR")[:, 0]
            foliage = np.isin(classes, FOLIAGE_CLASSES)
            self.assertTrue(foliage.any(), "le nuage de test doit porter de la végétation")
            self.assertTrue((~foliage).any(), "et des classes qui n'en sont pas")

            minerals = colors[~foliage]
            self.assertTrue(
                np.all(minerals[:, 0] > minerals[:, 1]), "le rouge de la photo doit dominer"
            )
            self.assertTrue(np.all(minerals[:, 2] == 0))

            plants = colors[foliage]
            self.assertTrue(
                np.all(plants[:, 1] > plants[:, 0]),
                "un point de végétation ne peut pas rester rouge",
            )

    def test_retombe_sur_les_classes_sans_orthophotographie(self) -> None:
        """Une emprise hors couverture, ou assemblée avant la recolorisation, doit produire
        son nuage sans erreur : le mode annoncé bascule, la scène reste servie."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file, run_dir = self._prepare_run(root)
            _, metadata_path = create_source_points(PocConfig.load(root, config_file), run_dir)
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["bakedColorMode"], "classification")
            self.assertFalse(metadata["occlusionBaked"])

    def test_refuse_un_mode_de_couleur_inconnu(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file, run_dir = self._prepare_run(root, "SOURCE_POINT_COLOR=arc-en-ciel\n")
            with self.assertRaisesRegex(ValueError, "SOURCE_POINT_COLOR"):
                create_source_points(PocConfig.load(root, config_file), run_dir)

    def test_publie_les_seuils_de_la_contrainte_de_teinte(self) -> None:
        """Le visualiseur rééchantillonne lui-même l'orthophotographie : sans ces seuils, il
        appliquerait sa propre correction et les deux chemins divergeraient."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file, run_dir = self._prepare_run(root, ortho=True)
            _, metadata_path = create_source_points(PocConfig.load(root, config_file), run_dir)
            published = json.loads(metadata_path.read_text(encoding="utf-8"))["foliageGreen"]
            self.assertEqual(published["classes"], list(FOLIAGE_CLASSES))
            self.assertEqual(published["hueMin"], FOLIAGE_HUE_RANGE[0])
            self.assertEqual(published["hueMax"], FOLIAGE_HUE_RANGE[1])
            self.assertEqual(published["saturationMin"], FOLIAGE_MINIMUM_SATURATION)


class FoliageGreenTest(unittest.TestCase):
    """La contrainte de teinte du feuillage, en sRGB sur huit bits."""

    # La couleur revient sur huit bits par canal : l'arrondi déplace la teinte d'une fraction
    # de degré, et une borne posée à 80° se relit à 79,7°. C'est la limite du format, pas de
    # la contrainte — sur une plage de soixante degrés, elle est sans portée visuelle.
    QUANTIZATION_DEG = 1.0
    QUANTIZATION_SATURATION = 1 / 255

    def _hsv(self, color: np.ndarray) -> tuple[float, float, float]:
        hue, saturation, value = _rgb_to_hsv(color.reshape(1, 3).astype(np.float64) / 255.0)[0]
        return float(hue), float(saturation), float(value)

    def _assert_dans_les_verts(self, color: np.ndarray) -> None:
        hue, saturation, _ = self._hsv(color)
        self.assertGreaterEqual(hue, FOLIAGE_HUE_RANGE[0] - self.QUANTIZATION_DEG)
        self.assertLessEqual(hue, FOLIAGE_HUE_RANGE[1] + self.QUANTIZATION_DEG)
        self.assertGreaterEqual(
            saturation, FOLIAGE_MINIMUM_SATURATION - self.QUANTIZATION_SATURATION
        )

    def test_un_point_de_vegetation_sur_une_toiture_ne_reste_pas_blanc(self) -> None:
        """Le cas qui a motivé la correction : la couleur vue à l'aplomb du point n'est pas
        celle de l'arbre, et un houppier constellé de blanc se lit comme s'il poussait du
        bâti."""
        blanc = np.array([[242, 240, 236]], dtype=np.uint8)
        self._assert_dans_les_verts(_greened(blanc, np.array([5]))[0])

    def test_couvre_les_trois_strates_et_les_teintes_qui_derangent(self) -> None:
        for classe in FOLIAGE_CLASSES:
            for nom, couleur in (
                ("blanc", (242, 240, 236)),
                ("rose", (232, 196, 196)),
                ("gris clair", (168, 168, 168)),
                ("tuile", (196, 104, 76)),
            ):
                with self.subTest(classe=classe, couleur=nom):
                    greened = _greened(np.array([couleur], dtype=np.uint8), np.array([classe]))
                    self._assert_dans_les_verts(greened[0])

    def test_ne_touche_pas_aux_autres_classes(self) -> None:
        """Verdir une toiture ou une route n'aurait aucun sens : c'est le contrôle qui prouve
        que le filtre vise la végétation et rien d'autre."""
        couleurs = np.array([[242, 240, 236]] * 4, dtype=np.uint8)
        # Sol, bâtiment, eau, tablier de pont.
        greened = _greened(couleurs, np.array([2, 6, 9, 17]))
        np.testing.assert_array_equal(greened, couleurs)

    def test_conserve_la_luminosite(self) -> None:
        """La valeur porte l'ombrage et le relief du nuage : l'écraser rendrait un aplat vert
        où l'on ne distinguerait plus un houppier au soleil d'un sous-bois à l'ombre."""
        for couleur in ([242, 240, 236], [120, 118, 114], [40, 38, 36]):
            with self.subTest(couleur=couleur):
                source = np.array([couleur], dtype=np.uint8)
                _, _, avant = self._hsv(source[0])
                _, _, apres = self._hsv(_greened(source, np.array([5]))[0])
                self.assertAlmostEqual(avant, apres, delta=1 / 255)

    def test_laisse_un_feuillage_deja_vert_en_place(self) -> None:
        """La contrainte corrige, elle ne repeint pas : un arbre correctement photographié
        doit garder sa nuance."""
        vert = np.array([[106, 143, 78]], dtype=np.uint8)
        greened = _greened(vert, np.array([5]))
        np.testing.assert_allclose(greened[0], vert[0], atol=2)

    def test_ne_fait_rien_sur_un_nuage_sans_vegetation(self) -> None:
        couleurs = np.array([[10, 20, 30], [200, 100, 50]], dtype=np.uint8)
        np.testing.assert_array_equal(_greened(couleurs, np.array([2, 6])), couleurs)


if __name__ == "__main__":
    unittest.main()
