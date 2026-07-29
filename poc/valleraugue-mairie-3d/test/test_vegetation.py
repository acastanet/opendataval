from pathlib import Path
from tempfile import TemporaryDirectory
import json
import math
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.vegetation import (
    CROWN_CENTRE_FRACTION,
    CROWN_HALF_HEIGHT_FRACTION,
    Tree,
    create_vegetation,
    crown_triangles,
    detect_trees,
    load_trees,
    tree_geometry,
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


if __name__ == "__main__":
    unittest.main()
