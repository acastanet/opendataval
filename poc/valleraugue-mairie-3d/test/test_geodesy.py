from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.geodesy import (
    bbox_centre,
    bbox_corners,
    lambert93_to_wgs84,
    lidar_tiles,
    square_bbox,
    wgs84_to_lambert93,
)


class Lambert93Test(unittest.TestCase):
    def test_projette_le_point_de_reference_du_poc(self) -> None:
        """La mairie de Val-d'Aigoual : le seul couple de coordonnées dont le POC dispose
        dans les deux systèmes, documenté dans `config/area.geojson` et `poc-600m.conf`."""
        easting, northing = wgs84_to_lambert93(3.641219, 44.081089)
        self.assertAlmostEqual(easting, 751356, delta=1)
        self.assertAlmostEqual(northing, 6331551, delta=1)

    def test_revient_au_point_de_depart(self) -> None:
        for longitude, latitude in ((3.641219, 44.081089), (3.700903, 44.048777), (-1.55, 47.21)):
            with self.subTest(point=(longitude, latitude)):
                back = lambert93_to_wgs84(*wgs84_to_lambert93(longitude, latitude))
                self.assertAlmostEqual(back[0], longitude, places=7)
                self.assertAlmostEqual(back[1], latitude, places=7)

    def test_refuse_un_point_hors_du_domaine(self) -> None:
        """Inverser latitude et longitude est l'erreur de saisie la plus courante : à
        Valleraugue, elle sort du domaine et doit s'arrêter là plutôt que rendre un point."""
        with self.assertRaisesRegex(ValueError, "Longitude"):
            wgs84_to_lambert93(44.081089, 3.641219)
        with self.assertRaisesRegex(ValueError, "Latitude"):
            wgs84_to_lambert93(3.641219, 12.5)


class SquareBboxTest(unittest.TestCase):
    def test_centre_et_arrondit_l_emprise(self) -> None:
        self.assertEqual(
            square_bbox(756167.92, 6328002.07, 200),
            (756068.0, 6327902.0, 756268.0, 6328102.0),
        )

    def test_conserve_le_centre_demande(self) -> None:
        bbox = square_bbox(751356, 6331551, 600)
        self.assertEqual(bbox_centre(bbox), (751356.0, 6331551.0))
        self.assertEqual(bbox, (751056.0, 6331251.0, 751656.0, 6331851.0))

    def test_refuse_un_cote_impair_ou_nul(self) -> None:
        with self.assertRaisesRegex(ValueError, "pair"):
            square_bbox(700000, 6600000, 201)
        with self.assertRaisesRegex(ValueError, "positif"):
            square_bbox(700000, 6600000, 0)


class LidarTilesTest(unittest.TestCase):
    def test_nomme_la_dalle_par_son_coin_nord_ouest(self) -> None:
        """`LHD_FXX_0751_6332` couvre X 751000–752000 et Y 6331000–6332000 : c'est la dalle
        unique des trois emprises historiques, vérifiée sur leur `pdal_pipeline.json`."""
        self.assertEqual(lidar_tiles((751041, 6331236, 751671, 6331866)), ["LHD_FXX_0751_6332"])

    def test_liste_les_dalles_d_une_emprise_a_cheval(self) -> None:
        """Quinze mètres de marge suffisent à franchir une limite de dalle : l'emprise de
        Notre-Dame-de-la-Rouvière en traverse une par le nord."""
        self.assertEqual(
            lidar_tiles((756053, 6327887, 756283, 6328117)),
            ["LHD_FXX_0756_6329", "LHD_FXX_0756_6328"],
        )

    def test_ordonne_du_nord_ouest_au_sud_est(self) -> None:
        self.assertEqual(
            lidar_tiles((750500, 6330500, 751500, 6331500)),
            [
                "LHD_FXX_0750_6332",
                "LHD_FXX_0751_6332",
                "LHD_FXX_0750_6331",
                "LHD_FXX_0751_6331",
            ],
        )


class CornersTest(unittest.TestCase):
    def test_ferme_l_anneau_geojson(self) -> None:
        ring = bbox_corners((756068, 6327902, 756268, 6328102)).as_ring()
        self.assertEqual(len(ring), 5)
        self.assertEqual(ring[0], ring[-1])

    def test_ne_rend_pas_un_rectangle_en_longitude(self) -> None:
        """Un carré Lambert-93 n'en est pas un en WGS84 : les longitudes des deux coins
        ouest diffèrent, et les déduire l'une de l'autre fausserait l'aperçu."""
        corners = bbox_corners((751056, 6331251, 751656, 6331851))
        self.assertNotAlmostEqual(corners.south_west[0], corners.north_west[0], places=6)


if __name__ == "__main__":
    unittest.main()
