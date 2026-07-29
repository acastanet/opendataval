from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.occlusion import DARKEST, bake_occlusion, clearance, sky_view_factor


class SkyViewFactorTest(unittest.TestCase):
    """Un creux étroit voit moins de ciel qu'une surface plane : c'est tout ce qu'on exige."""

    def _trench(self) -> np.ndarray:
        surface = np.zeros((60, 60))
        surface[:, :28] = 12.0
        surface[:, 32:] = 12.0
        return surface

    def test_reste_borne_entre_zero_et_un(self) -> None:
        view = sky_view_factor(self._trench(), 1.0, azimuths=16, radius_m=25)
        self.assertGreaterEqual(view.min(), 0.0)
        self.assertLessEqual(view.max(), 1.0)

    def test_une_surface_plane_voit_tout_le_ciel(self) -> None:
        view = sky_view_factor(np.zeros((40, 40)), 1.0, azimuths=8, radius_m=15)
        np.testing.assert_allclose(view, 1.0)

    def test_une_ruelle_voit_moins_de_ciel_qu_une_esplanade(self) -> None:
        view = sky_view_factor(self._trench(), 1.0, azimuths=16, radius_m=25)
        self.assertLess(view[30, 30], 0.5)
        # Le sommet des murs, lui, est parfaitement dégagé.
        self.assertGreater(view[30, 5], 0.95)

    def test_une_pente_uniforme_n_assombrit_pas_le_versant_degage(self) -> None:
        """Le relief seul ne doit pas noircir la scène : l'aval voit encore tout le ciel."""
        slope = np.tile(np.arange(40.0), (40, 1))
        view = sky_view_factor(slope, 1.0, azimuths=16, radius_m=10)
        self.assertGreater(view[20, 39], 0.6)

    def test_refuse_un_nombre_d_azimuts_nul(self) -> None:
        with self.assertRaises(ValueError):
            sky_view_factor(np.zeros((10, 10)), 1.0, azimuths=0)

    def test_ignore_un_rayon_nul(self) -> None:
        np.testing.assert_allclose(sky_view_factor(np.ones((8, 8)), 1.0, radius_m=0), 1.0)


class ClearanceTest(unittest.TestCase):
    def test_mesure_la_hauteur_de_degagement_locale(self) -> None:
        terrain = np.zeros((40, 40))
        surface = terrain.copy()
        surface[18:22, 18:22] = 15.0
        reach = clearance(surface, terrain, 1.0, radius_m=8.0)
        # À portée de l'obstacle, il faut le dominer ; loin de lui, le sol est déjà dégagé.
        self.assertAlmostEqual(float(reach[20, 25]), 15.0)
        self.assertAlmostEqual(float(reach[0, 0]), 1.0)

    def test_ne_descend_jamais_sous_un_metre(self) -> None:
        """Un dégagement nul diviserait par zéro à l'échantillonnage."""
        reach = clearance(np.zeros((10, 10)), np.zeros((10, 10)), 1.0, radius_m=5.0)
        self.assertTrue((reach >= 1.0).all())


class BakedOcclusionTest(unittest.TestCase):
    def _baked(self, strength: float = 0.6):
        terrain = np.zeros((60, 60))
        surface = terrain.copy()
        surface[:, :28] = 12.0
        surface[:, 32:] = 12.0
        # Grille de 60 m à 1 m, coin nord-ouest en (0, 60).
        return bake_occlusion(
            surface, terrain, 0.0, 60.0, 1.0, azimuths=16, radius_m=25, strength=strength
        )

    def test_assombrit_le_fond_de_la_ruelle(self) -> None:
        baked = self._baked()
        floor = float(baked.at(np.array([30.0]), np.array([30.0]), np.array([0.0]))[0])
        open_ground = float(baked.at(np.array([5.0]), np.array([30.0]), np.array([12.0]))[0])
        self.assertLess(floor, open_ground)
        self.assertGreaterEqual(floor, DARKEST)

    def test_eclaircit_a_mesure_que_le_sommet_emerge(self) -> None:
        """Le pied d'un mur est assombri, son faîtage voit le ciel : sinon les toits noircissent."""
        baked = self._baked()
        x, y = np.array([30.0]), np.array([30.0])
        low = float(baked.at(x, y, np.array([0.0]))[0])
        high = float(baked.at(x, y, np.array([12.0]))[0])
        self.assertLess(low, high)
        self.assertAlmostEqual(high, 1.0, places=3)

    def test_une_intensite_nulle_n_assombrit_rien(self) -> None:
        baked = self._baked(strength=0.0)
        np.testing.assert_allclose(
            baked.at(np.array([30.0]), np.array([30.0]), np.array([0.0])), 1.0
        )


if __name__ == "__main__":
    unittest.main()
