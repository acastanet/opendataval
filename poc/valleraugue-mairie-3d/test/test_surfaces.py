from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.raster import close_mask, erode
from poc3d.surfaces import (
    BRIDGE_CLASS,
    MINIMUM_CELLS,
    WATER_CLASS,
    bridge_surface,
    canopy_massif,
    fit_plane,
    surface_triangles,
    water_surface,
)


SHAPE = (20, 20)
XMIN, YMAX, RESOLUTION = 0.0, 20.0, 1.0


def _cloud(cells: list[tuple[int, int]], klass: int, elevation) -> tuple[np.ndarray, ...]:
    """Nuage synthétique : quelques retours par cellule, à l'altitude demandée."""
    x, y, z, classification = [], [], [], []
    for row, column in cells:
        centre_x = XMIN + (column + 0.5) * RESOLUTION
        centre_y = YMAX - (row + 0.5) * RESOLUTION
        for _ in range(3):
            x.append(centre_x)
            y.append(centre_y)
            z.append(elevation(centre_x, centre_y) if callable(elevation) else elevation)
            classification.append(klass)
    return (
        np.array(x),
        np.array(y),
        np.array(z),
        np.array(classification),
        np.ones(len(x), dtype=bool),
    )


class MorphologyTest(unittest.TestCase):
    def test_erode_retire_les_bords(self) -> None:
        mask = np.ones((5, 5), dtype=bool)
        self.assertEqual(erode(mask).sum(), 9)

    def test_close_mask_comble_un_trou_sans_grossir(self) -> None:
        """Une classe LiDAR rasterisée est trouée : la fermeture doit reboucher, pas dilater."""
        mask = np.zeros((11, 11), dtype=bool)
        mask[3:8, 3:8] = True
        troue = mask.copy()
        troue[5, 5] = False
        ferme = close_mask(troue, 2)
        self.assertTrue(ferme[5, 5])
        self.assertEqual(ferme.sum(), mask.sum())

    def test_close_mask_conserve_les_cellules_mesurees(self) -> None:
        """L'érosion mord les bords de grille : aucune mesure ne doit disparaître."""
        mask = np.zeros((5, 5), dtype=bool)
        mask[0, 0] = mask[4, 4] = True
        self.assertTrue(close_mask(mask, 1)[0, 0])
        self.assertTrue(close_mask(mask, 1)[4, 4])

    def test_close_mask_ignore_un_nombre_de_passes_nul(self) -> None:
        mask = np.zeros((4, 4), dtype=bool)
        mask[1, 1] = True
        np.testing.assert_array_equal(close_mask(mask, 0), mask)


class FitPlaneTest(unittest.TestCase):
    def test_retrouve_un_plan_exact(self) -> None:
        x = np.array([0.0, 10.0, 0.0, 10.0])
        y = np.array([0.0, 0.0, 10.0, 10.0])
        z = 0.02 * x + 0.01 * y + 100.0
        slope_x, slope_y, _, residual = fit_plane(x, y, z)
        self.assertAlmostEqual(slope_x, 0.02, places=6)
        self.assertAlmostEqual(slope_y, 0.01, places=6)
        self.assertAlmostEqual(residual, 0.0, places=6)

    def test_signale_une_surface_non_plane_par_son_residu(self) -> None:
        """Le résidu est le seul garde-fou : sans lui, un plan caricature n'importe quoi."""
        x = np.array([0.0, 5.0, 10.0, 15.0])
        y = np.zeros(4)
        z = np.array([0.0, 9.0, 0.0, 9.0])
        self.assertGreater(fit_plane(x, y, z)[3], 1.0)

    def test_resiste_a_un_retour_aberrant(self) -> None:
        """Le laser rebondit mal sur l'eau : un reflet isolé ne doit pas basculer la nappe."""
        x = np.linspace(0.0, 100.0, 60)
        y = np.zeros(60)
        z = 0.02 * x + 300.0
        z[17] = 400.0
        slope_x, _, _, residual = fit_plane(x, y, z)
        self.assertAlmostEqual(slope_x, 0.02, places=6)
        self.assertLess(residual, 0.01)

    def test_conserve_l_ajustement_si_le_rejet_est_massif(self) -> None:
        """Rejeter la moitié des points signalerait une surface non plane, pas du bruit."""
        x = np.array([0.0, 1.0, 2.0, 3.0])
        y = np.zeros(4)
        z = np.array([0.0, 100.0, 0.0, 100.0])
        self.assertGreater(fit_plane(x, y, z)[3], 10.0)


class WaterSurfaceTest(unittest.TestCase):
    def _nappe(self, cells, elevation=350.0):
        x, y, z, classification, within = _cloud(cells, WATER_CLASS, elevation)
        return water_surface(
            x, y, z, classification, within, XMIN, YMAX, RESOLUTION, SHAPE
        )

    def test_produit_une_nappe_sur_l_emprise_mesuree(self) -> None:
        cells = [(row, column) for row in range(5, 10) for column in range(5, 10)]
        nappe = self._nappe(cells)
        self.assertEqual(nappe.cells, 25)
        self.assertTrue(np.allclose(nappe.elevations[5:10, 5:10], 350.0))
        self.assertTrue(np.isnan(nappe.elevations[0, 0]))

    def test_prend_l_altitude_du_plan_et_non_des_cellules(self) -> None:
        """Le laser rebondit mal sur l'eau : une cellule isolée est plus bruitée que la nappe."""
        cells = [(row, column) for row in range(5, 10) for column in range(5, 10)]
        x, y, z, classification, within = _cloud(cells, WATER_CLASS, 350.0)
        z[0] = 400.0  # retour aberrant sur une cellule
        nappe = water_surface(
            x, y, z, classification, within, XMIN, YMAX, RESOLUTION, SHAPE
        )
        self.assertLess(float(np.nanmax(nappe.elevations)), 355.0)

    def test_restitue_une_pente_longitudinale(self) -> None:
        """Une rivière descend : une nappe horizontale la ferait remonter à contre-courant."""
        cells = [(row, column) for row in range(9, 12) for column in range(2, 18)]
        nappe = self._nappe(cells, lambda cx, _cy: 340.0 + 0.02 * cx)
        ligne = nappe.elevations[10, 2:18]
        self.assertAlmostEqual(float(ligne[-1] - ligne[0]), 0.02 * 15, places=3)

    def test_ignore_une_classe_absente(self) -> None:
        x, y, z, classification, within = _cloud([(5, 5)], BRIDGE_CLASS, 350.0)
        nappe = water_surface(
            x, y, z, classification, within, XMIN, YMAX, RESOLUTION, SHAPE
        )
        self.assertTrue(nappe.is_empty())

    def test_ecarte_un_residu_de_classification(self) -> None:
        """Quelques cellules éparses ne sont pas un cours d'eau."""
        cells = [(row, row) for row in range(3)]
        self.assertLess(len(cells), MINIMUM_CELLS)
        self.assertTrue(self._nappe(cells).is_empty())


class BridgeSurfaceTest(unittest.TestCase):
    def test_prend_l_altitude_mesuree_du_tablier(self) -> None:
        cells = [(row, column) for row in range(8, 13) for column in range(8, 13)]
        x, y, z, classification, within = _cloud(cells, BRIDGE_CLASS, 351.5)
        nappe = bridge_surface(
            x, y, z, classification, within, XMIN, YMAX, RESOLUTION, SHAPE
        )
        self.assertEqual(nappe.cells, 25)
        self.assertTrue(np.allclose(nappe.elevations[8:13, 8:13], 351.5))

    def test_comble_un_trou_par_la_mediane(self) -> None:
        cells = [
            (row, column)
            for row in range(8, 13)
            for column in range(8, 13)
            if (row, column) != (10, 10)
        ]
        x, y, z, classification, within = _cloud(cells, BRIDGE_CLASS, 351.5)
        nappe = bridge_surface(
            x, y, z, classification, within, XMIN, YMAX, RESOLUTION, SHAPE
        )
        self.assertAlmostEqual(float(nappe.elevations[10, 10]), 351.5)
        self.assertEqual(nappe.cells, 25)


class CanopyMassifTest(unittest.TestCase):
    def test_produit_une_nappe_sur_une_plage_dense(self) -> None:
        terrain = np.full((20, 20), 300.0)
        canopy = np.full((20, 20), np.nan)
        canopy[4:16, 4:16] = 12.0
        nappe = canopy_massif(
            canopy,
            terrain,
            1.0,
            coverage=0.6,
            minimum_height=4.0,
            smoothing=2.0,
        )
        self.assertGreater(nappe.cells, 0)
        self.assertTrue((nappe.elevations[np.isfinite(nappe.elevations)] >= 312.0).all())

    def test_ignore_une_plage_eparse(self) -> None:
        terrain = np.full((20, 20), 300.0)
        canopy = np.full((20, 20), np.nan)
        canopy[2::5, 2::5] = 10.0
        nappe = canopy_massif(
            canopy,
            terrain,
            1.0,
            coverage=0.6,
            minimum_height=4.0,
            smoothing=2.0,
        )
        self.assertTrue(nappe.is_empty())

    def test_ne_descend_jamais_sous_le_terrain(self) -> None:
        terrain = np.arange(100, dtype=np.float64).reshape(10, 10) + 250.0
        canopy = np.full((10, 10), 8.0)
        nappe = canopy_massif(
            canopy,
            terrain,
            1.0,
            coverage=0.6,
            minimum_height=4.0,
            smoothing=2.0,
        )
        selected = np.isfinite(nappe.elevations)
        self.assertTrue((nappe.elevations[selected] >= terrain[selected]).all())


class SurfaceTrianglesTest(unittest.TestCase):
    def _nappe(self) -> np.ndarray:
        elevations = np.full((4, 4), np.nan)
        elevations[1, 1] = 110.0
        return elevations

    def test_maille_une_cellule_en_deux_triangles(self) -> None:
        triangles = surface_triangles(
            self._nappe(), XMIN, YMAX, RESOLUTION, (0.0, 0.0), 100.0
        )
        self.assertEqual(len(triangles), 2)
        self.assertTrue(all(abs(point[1] - 10.0) < 1e-9 for tri in triangles for point in tri))

    def test_oriente_la_nappe_vers_le_haut(self) -> None:
        """Une normale inversée ferait disparaître l'eau en rendu simple face."""
        for triangle in surface_triangles(
            self._nappe(), XMIN, YMAX, RESOLUTION, (0.0, 0.0), 100.0
        ):
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = triangle
            ux, uy, uz = bx - ax, by - ay, bz - az
            vx, vy, vz = cx - ax, cy - ay, cz - az
            self.assertGreater(uz * vx - ux * vz, 0)

    def test_ajoute_une_sous_face_et_des_bords_avec_une_epaisseur(self) -> None:
        """Un tablier se voit par en dessous depuis la rivière : il lui faut un volume."""
        triangles = surface_triangles(
            self._nappe(), XMIN, YMAX, RESOLUTION, (0.0, 0.0), 100.0, thickness=1.0
        )
        self.assertEqual(len(triangles), 2 + 2 + 8)
        altitudes = {round(point[1], 6) for tri in triangles for point in tri}
        self.assertEqual(altitudes, {10.0, 9.0})

    def test_ignore_une_nappe_vide(self) -> None:
        vide = np.full((4, 4), np.nan)
        self.assertEqual(surface_triangles(vide, XMIN, YMAX, RESOLUTION, (0.0, 0.0), 0.0), [])


if __name__ == "__main__":
    unittest.main()
