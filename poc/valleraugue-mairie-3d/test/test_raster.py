from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.raster import fill_rings


def _ring(*corners: tuple[float, float]) -> tuple[np.ndarray, np.ndarray]:
    points = np.asarray(corners, dtype=np.float64)
    return points[:, 0], points[:, 1]


def _grid(size: int = 10) -> np.ndarray:
    return np.zeros((size, size), dtype=np.uint32)


class FillRingsTest(unittest.TestCase):
    """Rastérisation des polygones de la BD Charm-50.

    La grille de référence fait 10 × 10 cellules d'un mètre, coin nord-ouest en (0, 10) :
    la cellule [ligne, colonne] a donc son centre en (colonne + 0,5 ; 9,5 - ligne).
    """

    def test_remplit_un_carre_sur_ses_centres_de_cellules(self) -> None:
        grid = _grid()
        painted = fill_rings(
            grid, [_ring((2, 8), (8, 8), (8, 2), (2, 2))], 7, 0.0, 10.0, 1.0
        )
        self.assertEqual(painted, 36)
        self.assertTrue((grid[2:8, 2:8] == 7).all())
        self.assertFalse(grid[1].any())
        self.assertFalse(grid[:, 1].any())

    def test_conserve_les_anneaux_interieurs(self) -> None:
        """Le format Shapefile distingue un trou par son sens de parcours, que la règle
        pair-impair traite sans avoir à le lire."""
        grid = _grid()
        fill_rings(
            grid,
            [_ring((2, 8), (8, 8), (8, 2), (2, 2)), _ring((4, 6), (6, 6), (6, 4), (4, 4))],
            7,
            0.0,
            10.0,
            1.0,
        )
        self.assertFalse(grid[4:6, 4:6].any(), "le trou doit rester vide")
        self.assertEqual(int((grid == 7).sum()), 32)

    def test_reunit_les_parties_disjointes_sous_un_meme_identifiant(self) -> None:
        grid = _grid()
        fill_rings(
            grid,
            [_ring((0, 10), (3, 10), (3, 7), (0, 7)), _ring((7, 3), (10, 3), (10, 0), (7, 0))],
            3,
            0.0,
            10.0,
            1.0,
        )
        self.assertTrue((grid[0:3, 0:3] == 3).all())
        self.assertTrue((grid[7:10, 7:10] == 3).all())
        self.assertFalse(grid[5, 5])

    def test_place_le_nord_sur_la_ligne_zero(self) -> None:
        """Convention partagée par toutes les grilles du POC : sans elle, la texture
        géologique se draperait à l'envers de l'orthophoto."""
        grid = _grid()
        fill_rings(grid, [_ring((0, 10), (10, 10), (10, 9), (0, 9))], 5, 0.0, 10.0, 1.0)
        self.assertTrue((grid[0] == 5).all())
        self.assertFalse(grid[1:].any())

    def test_decoupe_sur_l_emprise_sans_perdre_la_parite(self) -> None:
        """Une formation départementale déborde de plusieurs kilomètres : ses arêtes de
        l'est sont hors grille, mais les retirer inverserait le dedans et le dehors."""
        grid = _grid()
        painted = fill_rings(
            grid,
            [_ring((-5000, 5000), (5000, 5000), (5000, -5000), (-5000, -5000))],
            9,
            0.0,
            10.0,
            1.0,
        )
        self.assertEqual(painted, 100)
        self.assertTrue((grid == 9).all())

    def test_ignore_une_geometrie_vide_ou_degeneree(self) -> None:
        grid = _grid()
        self.assertEqual(fill_rings(grid, [], 1, 0.0, 10.0, 1.0), 0)
        self.assertEqual(
            fill_rings(grid, [_ring((1, 1), (2, 2))], 1, 0.0, 10.0, 1.0),
            0,
            "un anneau de moins de trois sommets n'a pas d'intérieur",
        )
        self.assertEqual(
            fill_rings(grid, [_ring((1, 5), (9, 5), (5, 5))], 1, 0.0, 10.0, 1.0),
            0,
            "un anneau plat ne couvre aucun centre de cellule",
        )
        self.assertFalse(grid.any())

    def test_ignore_une_geometrie_entierement_hors_grille(self) -> None:
        grid = _grid()
        for ring in (
            _ring((0, 500), (10, 500), (10, 400), (0, 400)),
            _ring((0, -400), (10, -400), (10, -500), (0, -500)),
            _ring((400, 8), (500, 8), (500, 2), (400, 2)),
        ):
            self.assertEqual(fill_rings(grid, [ring], 4, 0.0, 10.0, 1.0), 0)
        self.assertFalse(grid.any())

    def test_la_derniere_formation_peinte_recouvre_la_precedente(self) -> None:
        """Deux formations qui se chevauchent ne peuvent pas cohabiter dans un pixel : la
        couverture de la légende est comptée après coup, sur la grille finale."""
        grid = _grid()
        fill_rings(grid, [_ring((0, 10), (10, 10), (10, 0), (0, 0))], 1, 0.0, 10.0, 1.0)
        fill_rings(grid, [_ring((4, 6), (6, 6), (6, 4), (4, 4))], 2, 0.0, 10.0, 1.0)
        self.assertEqual(int((grid == 2).sum()), 4)
        self.assertEqual(int((grid == 1).sum()), 96)


if __name__ == "__main__":
    unittest.main()
