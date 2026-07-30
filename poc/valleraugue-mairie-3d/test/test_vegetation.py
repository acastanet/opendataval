from pathlib import Path
from tempfile import TemporaryDirectory
import json
import math
import sys
import unittest
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.vegetation import (
    CROWN_CENTRE_FRACTION,
    CROWN_HALF_HEIGHT_FRACTION,
    CROWN_VERTICES,
    REFERENCE_FOLIAGE,
    Tree,
    classify_forest_types,
    create_vegetation,
    crown_relief,
    crown_triangles,
    detect_trees,
    download_forest_types,
    load_trees,
    sample_foliage_tints,
    tree_geometry,
    tree_shape,
)


def _config(root: Path, extra: str = "") -> PocConfig:
    config_file = root / "poc.conf"
    config_file.write_text(
        'POC_BBOX="0 0 40 40"\n'
        "EXPECTED_WIDTH_M=40\nEXPECTED_HEIGHT_M=40\n"
        "TERRAIN_MARGIN_M=0\nTERRAIN_RESOLUTION_M=1\n"
        "VEGETATION_MIN_HEIGHT_M=4\nVEGETATION_PEAK_WINDOW_M=5\nVEGETATION_MAX_CROWN_M=6\n"
        + extra,
        encoding="utf-8",
    )
    return PocConfig.load(root, config_file)


def _cone(shape: tuple[int, int], row: int, column: int, height: float, radius: float) -> np.ndarray:
    """Houppier synthétique : hauteur décroissant linéairement jusqu'au rayon donné."""
    rows, columns = np.indices(shape)
    distance = np.hypot(rows - row, columns - column)
    canopy = height * (1.0 - distance / radius)
    return np.where(distance <= radius, canopy, np.nan)


class DetectTreesTest(unittest.TestCase):
    def test_produit_un_proxy_a_la_bonne_position_et_a_la_bonne_hauteur(self) -> None:
        with TemporaryDirectory() as directory:
            config = _config(Path(directory))
            canopy = _cone((40, 40), row=10, column=25, height=14.0, radius=4.0)
            trees = detect_trees(config, canopy, np.full((40, 40), 300.0))
            self.assertEqual(len(trees), 1)
            tree = trees[0]
            # Grille de 40 m à 1 m, origine au nord-ouest : ligne 10 -> y = 29,5 m.
            self.assertAlmostEqual(tree.x, 25.5)
            self.assertAlmostEqual(tree.y, 29.5)
            self.assertAlmostEqual(tree.height, 14.0)
            self.assertAlmostEqual(tree.ground, 300.0)
            # Le rayon mesuré reste dans l'ordre de grandeur du houppier synthétique.
            self.assertGreater(tree.crown, 1.0)
            self.assertLessEqual(tree.crown, 4.0)

    def test_ne_produit_rien_sans_classe_5(self) -> None:
        with TemporaryDirectory() as directory:
            config = _config(Path(directory))
            canopy = np.full((40, 40), np.nan)
            self.assertEqual(detect_trees(config, canopy, np.zeros((40, 40))), [])

    def test_ignore_un_couvert_trop_bas(self) -> None:
        """Un buisson de 2 m n'est pas un arbre : le seuil doit l'écarter."""
        with TemporaryDirectory() as directory:
            config = _config(Path(directory))
            canopy = _cone((40, 40), 20, 20, height=2.0, radius=3.0)
            self.assertEqual(detect_trees(config, canopy, np.zeros((40, 40))), [])

    def test_ne_produit_qu_une_cime_par_houppier(self) -> None:
        """Un houppier large offre un plateau de maxima : sans suppression, une grappe."""
        with TemporaryDirectory() as directory:
            config = _config(Path(directory))
            canopy = _cone((40, 40), 20, 20, height=20.0, radius=6.0)
            self.assertEqual(len(detect_trees(config, canopy, np.zeros((40, 40)))), 1)

    def test_separe_deux_arbres_distants(self) -> None:
        with TemporaryDirectory() as directory:
            config = _config(Path(directory))
            canopy = np.fmax(
                _cone((40, 40), 10, 10, 12.0, 3.0), _cone((40, 40), 30, 30, 9.0, 3.0)
            )
            trees = detect_trees(config, canopy, np.zeros((40, 40)))
            self.assertEqual(len(trees), 2)
            # Le parcours va du plus haut au plus bas : la cime dominante vient en premier.
            self.assertGreater(trees[0].height, trees[1].height)

    def test_refuse_un_seuil_nul(self) -> None:
        with TemporaryDirectory() as directory:
            config = _config(Path(directory), "VEGETATION_MIN_HEIGHT_M=0\n")
            with self.assertRaises(ValueError):
                detect_trees(config, np.zeros((8, 8)), np.zeros((8, 8)))


class CreateVegetationTest(unittest.TestCase):
    def test_ecrit_trees_json_et_le_relit(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = _config(root)
            run_dir = root / "run-test"
            run_dir.mkdir()
            np.save(run_dir / "canopy.npy", _cone((40, 40), 10, 25, 14.0, 4.0))
            np.save(run_dir / "terrain.npy", np.full((40, 40), 300.0))
            destination = create_vegetation(config, run_dir)
            payload = json.loads(destination.read_text(encoding="utf-8"))
            self.assertEqual(payload["count"], 1)
            self.assertEqual(len(load_trees(run_dir)), 1)

    def test_retombe_sur_le_profil_generique_si_bd_foret_est_indisponible(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = _config(root, "VEGETATION_FOREST_TYPES=1\n")
            run_dir = root / "run-test"
            run_dir.mkdir()
            np.save(run_dir / "canopy.npy", _cone((40, 40), 10, 25, 14.0, 4.0))
            np.save(run_dir / "terrain.npy", np.full((40, 40), 300.0))
            with patch("poc3d.vegetation.download_forest_types", side_effect=OSError("hors ligne")):
                destination = create_vegetation(config, run_dir)
            payload = json.loads(destination.read_text(encoding="utf-8"))
            self.assertEqual(payload["foliage"], {"generic": 1})
            self.assertNotIn("forestSource", payload)

    def test_echoue_sans_modele_de_canopee(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            run_dir = root / "run-test"
            run_dir.mkdir()
            with self.assertRaises(FileNotFoundError):
                create_vegetation(_config(root), run_dir)

    def test_ne_renvoie_rien_si_l_etape_n_a_pas_ete_executee(self) -> None:
        with TemporaryDirectory() as directory:
            self.assertEqual(load_trees(Path(directory)), [])


class TreeGeometryTest(unittest.TestCase):
    def test_pose_le_proxy_sur_le_sol_et_le_centre_sur_la_cime(self) -> None:
        tree = Tree(x=120.0, y=250.0, ground=310.0, height=10.0, crown=3.0)
        crown, trunk = tree_geometry(tree, (100.0, 260.0), base_elevation=300.0)
        vertices = [point for triangle in crown + trunk for point in triangle]
        # X vers l'est, Z vers le sud, Y au-dessus de la base : 20 m à l'est, 10 m au sud.
        self.assertAlmostEqual(sum(point[0] for point in vertices) / len(vertices), 20.0, places=5)
        self.assertAlmostEqual(sum(point[2] for point in vertices) / len(vertices), 10.0, places=5)
        # Le fût part exactement du sol : aucun arbre ne doit flotter.
        self.assertAlmostEqual(min(point[1] for point in trunk[0]), 10.0)
        # Et la cime culmine à peu près à la hauteur mesurée.
        self.assertAlmostEqual(
            max(point[1] for point in vertices),
            10.0 + 10.0 * (CROWN_CENTRE_FRACTION + CROWN_HALF_HEIGHT_FRACTION),
            places=5,
        )

    def test_le_houppier_respecte_le_rayon_demande(self) -> None:
        triangles = crown_triangles((0.0, 0.0, 0.0), radius=4.0, half_height=2.0)
        points = [point for triangle in triangles for point in triangle]
        for axis, extent in ((0, 4.0), (1, 2.0), (2, 4.0)):
            self.assertAlmostEqual(max(abs(p[axis]) for p in points), extent, places=5)

    def test_la_rotation_conserve_la_hauteur_et_le_volume(self) -> None:
        """Tourner un houppier ne doit ni le rallonger ni l'enfoncer dans le terrain."""
        droit = crown_triangles((0.0, 0.0, 0.0), 4.0, 2.0)
        tourne = crown_triangles((0.0, 0.0, 0.0), 4.0, 2.0, rotation=math.pi / 3)
        for triangles in (droit, tourne):
            points = [point for triangle in triangles for point in triangle]
            self.assertAlmostEqual(max(abs(p[1]) for p in points), 2.0, places=5)
        self.assertEqual(len(droit), len(tourne))

    def test_l_ovalite_etire_un_axe_et_comprime_l_autre(self) -> None:
        points = [
            point
            for triangle in crown_triangles((0.0, 0.0, 0.0), 4.0, 2.0, ovality=1.25)
            for point in triangle
        ]
        self.assertAlmostEqual(max(abs(p[0]) for p in points), 5.0, places=5)
        self.assertAlmostEqual(max(abs(p[2]) for p in points), 3.2, places=5)

    def test_affine_la_cime_d_un_conifere_sans_changer_sa_hauteur(self) -> None:
        generic = crown_triangles((0.0, 0.0, 0.0), 4.0, 2.0)
        conifer = crown_triangles((0.0, 0.0, 0.0), 4.0, 2.0, profile="conifer")
        generic_top = [point for triangle in generic for point in triangle if point[1] == 2.0]
        conifer_top = [point for triangle in conifer for point in triangle if point[1] == 2.0]
        generic_radius = max(math.hypot(point[0], point[2]) for point in generic_top)
        conifer_radius = max(math.hypot(point[0], point[2]) for point in conifer_top)
        self.assertLess(conifer_radius, generic_radius * 0.2)
        self.assertEqual(
            max(point[1] for triangle in generic for point in triangle),
            max(point[1] for triangle in conifer for point in triangle),
        )


class CrownVerticesTest(unittest.TestCase):
    """Le visualiseur segmente la primitive fusionnée avec ce pas pour retrouver chaque arbre.

    Si la géométrie du houppier change sans que la constante suive, les curseurs de taille
    redimensionneraient des morceaux d'arbres voisins — sans la moindre erreur visible.
    """

    def test_correspond_a_la_geometrie_produite(self) -> None:
        triangles = crown_triangles((0.0, 0.0, 0.0), 3.0, 2.0)
        self.assertEqual(sum(len(triangle) for triangle in triangles), CROWN_VERTICES)

    def test_decoupe_exactement_les_houppiers_d_une_scene(self) -> None:
        trees = [
            Tree(x=float(index) * 10, y=0.0, ground=0.0, height=8.0, crown=3.0)
            for index in range(4)
        ]
        sommets = sum(
            len(triangle)
            for tree in trees
            for triangle in tree_geometry(tree, (0.0, 0.0), 0.0)[0]
        )
        self.assertEqual(sommets, len(trees) * CROWN_VERTICES)


class TreeShapeTest(unittest.TestCase):
    def test_est_stable_pour_un_meme_arbre(self) -> None:
        """Un arbre doit garder sa silhouette d'une génération de la scène à l'autre."""
        tree = Tree(x=12.34, y=56.78, ground=100.0, height=9.0, crown=3.0)
        self.assertEqual(tree_shape(tree), tree_shape(tree))

    def test_differe_d_un_arbre_a_l_autre(self) -> None:
        first = tree_shape(Tree(x=10.0, y=10.0, ground=0.0, height=8.0, crown=3.0))
        second = tree_shape(Tree(x=20.0, y=30.0, ground=0.0, height=8.0, crown=3.0))
        self.assertNotEqual(first, second)

    def test_borne_l_ovalite(self) -> None:
        for offset in range(60):
            _, ovality = tree_shape(
                Tree(x=offset * 1.7, y=offset * 2.3, ground=0.0, height=8.0, crown=3.0)
            )
            self.assertGreaterEqual(ovality, 0.85)
            self.assertLessEqual(ovality, 1.15)


class CrownReliefTest(unittest.TestCase):
    """Le relief casse la régularité d'un houppier sans toucher à ce qu'il mesure."""

    def test_une_amplitude_nulle_rend_la_geometrie_reguliere(self) -> None:
        tree = Tree(x=12.34, y=56.78, ground=100.0, height=9.0, crown=3.0)
        self.assertEqual(set(crown_relief(tree, 0.0)), {1.0})
        self.assertEqual(
            tree_geometry(tree, (0.0, 0.0), 0.0),
            tree_geometry(tree, (0.0, 0.0), 0.0, irregularity=0.0),
        )

    def test_est_stable_pour_un_meme_arbre_et_differe_d_un_arbre_a_l_autre(self) -> None:
        first = Tree(x=12.34, y=56.78, ground=100.0, height=9.0, crown=3.0)
        second = Tree(x=98.76, y=54.32, ground=100.0, height=9.0, crown=3.0)
        self.assertEqual(crown_relief(first, 0.18), crown_relief(first, 0.18))
        self.assertNotEqual(crown_relief(first, 0.18), crown_relief(second, 0.18))

    def test_borne_le_relief_et_le_repartit_sur_les_sommets(self) -> None:
        for offset in range(40):
            relief = crown_relief(
                Tree(x=offset * 1.7, y=offset * 2.3, ground=0.0, height=8.0, crown=3.0), 0.18
            )
            self.assertEqual(len(relief), 12)
            for factor in relief:
                self.assertGreaterEqual(factor, 0.82)
                self.assertLessEqual(factor, 1.18)
            # Un facteur unique appliqué aux douze sommets ne ferait que grossir la boule.
            self.assertGreater(len(set(relief)), 6)

    def test_ne_deplace_ni_la_cime_ni_l_assise(self) -> None:
        """La hauteur mesurée par le LiDAR est le seul chiffre que le proxy restitue."""
        tree = Tree(x=12.34, y=56.78, ground=100.0, height=9.0, crown=3.0)
        regulier, _ = tree_geometry(tree, (0.0, 0.0), 100.0)
        bosselé, _ = tree_geometry(tree, (0.0, 0.0), 100.0, irregularity=0.18)
        for extremum in (max, min):
            self.assertAlmostEqual(
                extremum(point[1] for triangle in regulier for point in triangle),
                extremum(point[1] for triangle in bosselé for point in triangle),
                places=9,
            )

    def test_conserve_le_nombre_de_sommets_par_houppier(self) -> None:
        tree = Tree(x=12.34, y=56.78, ground=0.0, height=9.0, crown=3.0)
        crown, _ = tree_geometry(tree, (0.0, 0.0), 0.0, irregularity=0.18)
        self.assertEqual(sum(len(triangle) for triangle in crown), CROWN_VERTICES)


class FoliageTintTest(unittest.TestCase):
    """La teinte vient de l'orthophotographie : elle porte la couleur réelle de chaque arbre."""

    def _uv(self):
        return lambda x, y: (x / 100.0, y / 100.0)

    def _ortho(self, colour) -> np.ndarray:
        return np.tile(np.array(colour, dtype=np.float64), (100, 100, 1))

    def test_suit_la_teinte_echantillonnee(self) -> None:
        tints = sample_foliage_tints(
            [Tree(x=50.0, y=50.0, ground=0.0, height=8.0, crown=3.0)],
            self._ortho((0.10, 0.45, 0.12)),
            self._uv(),
        )
        red, green, blue = tints[0]
        self.assertGreater(green, red)
        self.assertGreater(green, blue)

    def test_normalise_la_luminance_d_une_zone_d_ombre(self) -> None:
        """L'ortho porte les ombres de la prise de vue ; un arbre à l'ombre serait noir."""
        clair = sample_foliage_tints(
            [Tree(x=50.0, y=50.0, ground=0.0, height=8.0, crown=3.0)],
            self._ortho((0.20, 0.60, 0.24)),
            self._uv(),
        )[0]
        sombre = sample_foliage_tints(
            [Tree(x=50.0, y=50.0, ground=0.0, height=8.0, crown=3.0)],
            self._ortho((0.05, 0.15, 0.06)),
            self._uv(),
        )[0]
        for a, b in zip(clair, sombre):
            self.assertAlmostEqual(a, b, places=6)

    def test_reste_dans_l_intervalle_affichable(self) -> None:
        for colour in ((1.0, 1.0, 1.0), (0.0, 0.0, 0.0), (0.9, 0.1, 0.1)):
            for channel in sample_foliage_tints(
                [Tree(x=50.0, y=50.0, ground=0.0, height=8.0, crown=3.0)],
                self._ortho(colour),
                self._uv(),
            )[0]:
                self.assertGreaterEqual(channel, 0.0)
                self.assertLessEqual(channel, 1.0)

    def test_retombe_sur_le_vert_de_reference_dans_le_noir_absolu(self) -> None:
        """Une cime mal détectée ne doit pas produire un arbre noir."""
        tint = sample_foliage_tints(
            [Tree(x=50.0, y=50.0, ground=0.0, height=8.0, crown=3.0)],
            self._ortho((0.0, 0.0, 0.0)),
            self._uv(),
        )[0]
        self.assertEqual(tint, REFERENCE_FOLIAGE)

    def test_borne_une_teinte_aberrante_par_le_melange(self) -> None:
        """Un arbre tombé sur une toiture rouge ne doit pas ressortir orange vif."""
        rouge = sample_foliage_tints(
            [Tree(x=50.0, y=50.0, ground=0.0, height=8.0, crown=3.0)],
            self._ortho((0.70, 0.20, 0.15)),
            self._uv(),
        )[0]
        self.assertGreater(rouge[1], REFERENCE_FOLIAGE[1] * 0.5)

    def test_echantillonne_sous_la_couronne_et_non_ailleurs(self) -> None:
        ortho = self._ortho((0.10, 0.10, 0.10))
        ortho[45:56, 45:56] = (0.10, 0.50, 0.10)
        tint = sample_foliage_tints(
            [Tree(x=50.0, y=50.0, ground=0.0, height=8.0, crown=3.0)], ortho, self._uv()
        )[0]
        self.assertGreater(tint[1], tint[0] * 1.5)


class ForestTypeTest(unittest.TestCase):
    def _payload(self) -> dict:
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "MultiPolygon",
                        "coordinates": [[[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]]],
                    },
                    "properties": {
                        "essence": "Conifères",
                        "tfv": "Forêt fermée de conifères purs",
                    },
                }
            ],
        }

    def test_classe_seulement_les_cimes_dans_une_plage_mesuree(self) -> None:
        trees = [
            Tree(10.0, 10.0, 0.0, 8.0, 3.0),
            Tree(30.0, 30.0, 0.0, 8.0, 3.0),
        ]
        classified = classify_forest_types(trees, self._payload())
        self.assertEqual(classified[0].foliage, "conifer")
        self.assertEqual(classified[0].essence, "Conifères")
        self.assertEqual(classified[1].foliage, "generic")
        self.assertIsNone(classified[1].essence)

    def test_construit_une_requete_wfs_lambert_93(self) -> None:
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps(self.payload).encode("utf-8")

            payload = self._payload()

        with TemporaryDirectory() as directory:
            with patch("poc3d.vegetation.urllib.request.urlopen", return_value=Response()) as mocked:
                payload = download_forest_types(_config(Path(directory)))
        self.assertEqual(len(payload["features"]), 1)
        request = mocked.call_args.args[0]
        self.assertIn("LANDCOVER.FORESTINVENTORY.V2%3Aformation_vegetale", request.full_url)
        self.assertIn("EPSG%3A%3A2154", request.full_url)

    def test_refuse_une_reponse_wfs_inattendue(self) -> None:
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'{"type":"FeatureCollection","features":"invalide"}'

        with TemporaryDirectory() as directory:
            with patch("poc3d.vegetation.urllib.request.urlopen", return_value=Response()):
                with self.assertRaises(RuntimeError):
                    download_forest_types(_config(Path(directory)))


if __name__ == "__main__":
    unittest.main()
