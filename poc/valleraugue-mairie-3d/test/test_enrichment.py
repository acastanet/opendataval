from pathlib import Path
from tempfile import TemporaryDirectory
import json
import sys
import unittest

import laspy
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.enrichment import _blend_seating, create_terrain


def _prepare_run(
    root: Path,
    margin: str = "0",
    resolution: str = "1",
    extra_points: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray] | None = None,
) -> tuple[PocConfig, Path]:
    config_file = root / f"poc-{margin}-{resolution}.conf"
    config_file.write_text(
        'POC_BBOX="0 0 2 2"\n'
        "EXPECTED_WIDTH_M=2\n"
        "EXPECTED_HEIGHT_M=2\n"
        f"TERRAIN_RESOLUTION_M={resolution}\n"
        f"TERRAIN_MARGIN_M={margin}\n",
        encoding="utf-8",
    )
    run_dir = root / "run-test"
    run_dir.mkdir(exist_ok=True)

    x = np.array([0.25, 1.25, 0.25, 1.25])
    y = np.array([1.75, 1.75, 0.75, 0.75])
    z = np.array([10.0, 11.0, 12.0, 13.0])
    classification = np.array([2, 2, 2, 2], dtype=np.uint8)
    if extra_points is not None:
        x = np.concatenate((x, extra_points[0]))
        y = np.concatenate((y, extra_points[1]))
        z = np.concatenate((z, extra_points[2]))
        classification = np.concatenate((classification, extra_points[3]))

    header = laspy.LasHeader(point_format=3, version="1.2")
    cloud = laspy.LasData(header)
    cloud.x = x
    cloud.y = y
    cloud.z = z
    cloud.classification = classification
    cloud.write(run_dir / "lidar_subset.laz")
    return PocConfig.load(root, config_file), run_dir


def _write_cityjsonseq(run_dir: Path, polygon: list[tuple[float, float]], elevation: float) -> None:
    """Écrit un bâtiment minimal dont seule l'emprise au sol est exploitée."""
    roofer = run_dir / "roofer_output"
    roofer.mkdir(parents=True, exist_ok=True)
    vertices = [[int(x * 1000), int(y * 1000), int(elevation * 1000)] for x, y in polygon]
    header = {"type": "CityJSON", "transform": {"scale": [0.001] * 3, "translate": [0.0] * 3}}
    feature = {
        "type": "CityJSONFeature",
        "vertices": vertices,
        "CityObjects": {
            "b1": {
                "type": "Building",
                "geometry": [
                    {
                        "type": "Solid",
                        "lod": "2.2",
                        "boundaries": [[[list(range(len(polygon)))]]],
                        "semantics": {
                            "surfaces": [{"type": "GroundSurface"}],
                            "values": [[0]],
                        },
                    }
                ],
            }
        },
    }
    (roofer / "test.city.jsonl").write_text(
        json.dumps(header) + "\n" + json.dumps(feature) + "\n", encoding="utf-8"
    )


def _blend_config(root: Path, blend: str) -> PocConfig:
    config_file = root / f"blend-{blend}.conf"
    config_file.write_text(
        f'POC_BBOX="0 0 9 9"\nTERRAIN_BLEND_M={blend}\n', encoding="utf-8"
    )
    return PocConfig.load(root, config_file)


def _largest_step(row: np.ndarray) -> float:
    return float(np.abs(np.diff(row)).max())


class EnrichmentTest(unittest.TestCase):
    def test_genere_un_terrain_natif_depuis_un_laz(self) -> None:
        with TemporaryDirectory() as directory:
            config, run_dir = _prepare_run(Path(directory))
            terrain_tif, terrain_grid = create_terrain(config, run_dir)
            with Image.open(terrain_tif) as image:
                self.assertEqual(image.size, (2, 2))
            self.assertEqual(np.load(terrain_grid).shape, (2, 2))

    def test_elargit_le_terrain_de_la_marge_configuree(self) -> None:
        with TemporaryDirectory() as directory:
            config, run_dir = _prepare_run(Path(directory), margin="1")
            self.assertEqual(config.terrain_bbox, (-1.0, -1.0, 3.0, 3.0))
            _, terrain_grid = create_terrain(config, run_dir)
            self.assertEqual(np.load(terrain_grid).shape, (4, 4))

    def test_assied_le_terrain_sous_l_emprise_du_batiment(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = _prepare_run(root)
            _write_cityjsonseq(run_dir, [(1.0, 0.0), (2.0, 0.0), (2.0, 1.0), (1.0, 1.0)], 4.0)
            _, terrain_grid = create_terrain(config, run_dir)
            grid = np.load(terrain_grid)
            # Cellule couverte par l'emprise : abaissée à la base du bâtiment.
            self.assertAlmostEqual(float(grid[1, 1]), 4.0)
            # Cellule voisine hors emprise : altitude LiDAR préservée.
            self.assertGreater(float(grid[1, 0]), 4.0)

    def test_raccorde_l_assise_au_relief_alentour(self) -> None:
        """Sans fondu, l'assise laisse une falaise d'une cellule au ras du mur amont."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            slope = np.tile(np.arange(9.0), (9, 1))
            target = np.full((9, 9), np.inf)
            target[3:6, 3:6] = 3.0

            abrupt = slope.copy()
            _blend_seating(_blend_config(root, "0"), abrupt, target.copy(), 1.0)
            smooth = slope.copy()
            _blend_seating(_blend_config(root, "3"), smooth, target.copy(), 1.0)

            # L'emprise est assise à la même altitude dans les deux cas.
            self.assertAlmostEqual(float(abrupt[4, 4]), 3.0)
            self.assertAlmostEqual(float(smooth[4, 4]), 3.0)
            # Mais la marche vers le relief naturel est nettement adoucie.
            self.assertLess(_largest_step(smooth[4]), _largest_step(abrupt[4]))
            # Et la transition reste monotone : aucun creux artificiel.
            outward = smooth[4, 5:]
            self.assertTrue(all(np.diff(outward) > 0), outward)

    def test_reproduit_l_assise_franche_sans_fondu(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            slope = np.tile(np.arange(9.0), (9, 1))
            target = np.full((9, 9), np.inf)
            target[3:6, 3:6] = 3.0
            seated = slope.copy()
            _blend_seating(_blend_config(root, "0"), seated, target.copy(), 1.0)
            np.testing.assert_allclose(seated, np.minimum(slope, np.where(np.isfinite(target), target, slope)))

    def test_double_la_grille_a_une_demi_maille(self) -> None:
        with TemporaryDirectory() as directory:
            config, run_dir = _prepare_run(Path(directory), resolution="0.5")
            _, terrain_grid = create_terrain(config, run_dir)
            self.assertEqual(np.load(terrain_grid).shape, (4, 4))

    def test_produit_la_canopee_et_le_modele_de_surface(self) -> None:
        """L'occlusion cuite et la végétation lisent ces deux dérivés, pas le nuage brut."""
        with TemporaryDirectory() as directory:
            # Les trois strates végétales et le bâti alimentent le MNS. Seule la classe 5
            # porte cependant une hauteur de canopée exploitable comme cime.
            extra = (
                np.array([0.25, 1.25, 0.25, 1.25]),
                np.array([1.75, 1.75, 0.75, 0.75]),
                np.array([18.0, 15.0, 16.0, 20.0]),
                np.array([5, 3, 4, 6], dtype=np.uint8),
            )
            config, run_dir = _prepare_run(Path(directory), extra_points=extra)
            create_terrain(config, run_dir)
            canopy = np.load(run_dir / "canopy.npy")
            surface = np.load(run_dir / "surface.npy")
            terrain = np.load(run_dir / "terrain.npy")
            self.assertAlmostEqual(float(canopy[0, 0]), 8.0)
            # Ailleurs, aucun point de végétation : la canopée n'y existe pas.
            self.assertTrue(np.isnan(canopy[1, 1]))
            # Le modèle de surface reste une altitude absolue, jamais sous le terrain.
            self.assertAlmostEqual(float(surface[0, 0]), 18.0)
            self.assertAlmostEqual(float(surface[0, 1]), 15.0)
            self.assertAlmostEqual(float(surface[1, 0]), 16.0)
            self.assertAlmostEqual(float(surface[1, 1]), 20.0)
            self.assertTrue((surface >= terrain).all())

    def test_produit_la_strate_arbustive_depuis_les_classes_3_et_4(self) -> None:
        """Les classes 3 et 4 ne pesaient que dans le MNS : rien ne les mesurait pour
        elles-mêmes, alors que le maximum par cellule était déjà calculé."""
        with TemporaryDirectory() as directory:
            extra = (
                np.array([0.25, 1.25, 0.25, 1.25]),
                np.array([1.75, 1.75, 0.75, 0.75]),
                np.array([18.0, 15.0, 16.0, 20.0]),
                np.array([5, 3, 4, 6], dtype=np.uint8),
            )
            config, run_dir = _prepare_run(Path(directory), extra_points=extra)
            create_terrain(config, run_dir)
            understory = np.load(run_dir / "understory.npy")
            # Cellule (0,1) : point de classe 3 à 15 m sur un sol à 11 m.
            self.assertAlmostEqual(float(understory[0, 1]), 4.0)
            # Cellule (1,0) : point de classe 4 à 16 m sur un sol à 12 m.
            self.assertAlmostEqual(float(understory[1, 0]), 4.0)
            # La classe 5 est de la canopée et la classe 6 du bâti : ni l'une ni l'autre
            # n'appartient à la strate basse.
            self.assertTrue(np.isnan(understory[0, 0]))
            self.assertTrue(np.isnan(understory[1, 1]))

    def test_le_reglage_retire_la_strate_arbustive(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = _prepare_run(root)
            create_terrain(config, run_dir)
            self.assertTrue((run_dir / "understory.npy").is_file())
            config_file = root / "sans-strate.conf"
            config_file.write_text(
                'POC_BBOX="0 0 2 2"\nTERRAIN_RESOLUTION_M=1\nTERRAIN_MARGIN_M=0\n'
                "UNDERSTORY=0\n",
                encoding="utf-8",
            )
            create_terrain(PocConfig.load(root, config_file), run_dir)
            # Le produit d'une exécution antérieure doit disparaître, faute de quoi la scène
            # continuerait d'afficher une strate que la configuration a désactivée.
            self.assertFalse((run_dir / "understory.npy").is_file())
            self.assertFalse((run_dir / "understory.tif").is_file())


class GeoTiffTest(unittest.TestCase):
    """Le géoréférencement vit désormais dans le GeoTIFF, plus dans un worldfile à côté."""

    def test_ecrit_le_crs_et_la_transformation_dans_le_fichier(self) -> None:
        import rasterio

        with TemporaryDirectory() as directory:
            config, run_dir = _prepare_run(Path(directory))
            terrain_tif, _ = create_terrain(config, run_dir)
            with rasterio.open(terrain_tif) as raster:
                self.assertEqual(raster.crs.to_epsg(), 2154)
                self.assertEqual(raster.transform.c, 0.0)
                self.assertEqual(raster.transform.f, 2.0)
                self.assertEqual(raster.res, (1.0, 1.0))

    def test_supprime_le_worldfile_d_une_execution_anterieure(self) -> None:
        """Un `.tfw` resté en place prime sur les métadonnées dans plusieurs SIG, et
        décalerait la couche sans que rien ne le signale."""
        with TemporaryDirectory() as directory:
            config, run_dir = _prepare_run(Path(directory))
            (run_dir / "terrain.tfw").write_text("obsolete\n", encoding="ascii")
            (run_dir / "terrain.prj").write_text("obsolete\n", encoding="ascii")
            create_terrain(config, run_dir)
            self.assertFalse((run_dir / "terrain.tfw").exists())
            self.assertFalse((run_dir / "terrain.prj").exists())

    def test_sort_la_canopee_exploitable_dans_un_sig(self) -> None:
        import rasterio

        with TemporaryDirectory() as directory:
            extra = (
                np.array([0.25]),
                np.array([1.75]),
                np.array([18.0]),
                np.array([5], dtype=np.uint8),
            )
            config, run_dir = _prepare_run(Path(directory), extra_points=extra)
            create_terrain(config, run_dir)
            with rasterio.open(run_dir / "canopy.tif") as raster:
                self.assertEqual(raster.crs.to_epsg(), 2154)
                hauteurs = raster.read(1)
            self.assertAlmostEqual(float(hauteurs[0, 0]), 8.0, places=5)
            # Les cellules sans mesure traversent le GeoTIFF en NaN, comme dans le .npy.
            self.assertTrue(np.isnan(hauteurs[1, 1]))


class TerrainResolutionTest(unittest.TestCase):
    """Le gain de la demi-maille se joue sur les ruptures de pente, pas sur la moyenne."""

    SIDE_M = 24.0

    def _run(self, root: Path, resolution: str) -> tuple[PocConfig, Path, np.ndarray]:
        config_file = root / f"terrasses-{resolution}.conf"
        config_file.write_text(
            f'POC_BBOX="0 0 {self.SIDE_M:g} {self.SIDE_M:g}"\n'
            f"EXPECTED_WIDTH_M={self.SIDE_M:g}\nEXPECTED_HEIGHT_M={self.SIDE_M:g}\n"
            f"TERRAIN_RESOLUTION_M={resolution}\nTERRAIN_MARGIN_M=0\n",
            encoding="utf-8",
        )
        run_dir = root / f"run-{resolution}"
        run_dir.mkdir()
        # Terrasses cévenoles : des paliers de 2 m séparés par des murs francs, sur une pente
        # d'ensemble. C'est exactement le relief que la maille métrique lisse — et le pas de
        # 3,7 m garantit qu'aucune maille ne s'aligne par chance sur les ruptures.
        rng = np.random.default_rng(20260729)
        x = rng.uniform(0, self.SIDE_M, 6000)
        y = rng.uniform(0, self.SIDE_M, 6000)
        z = 300.0 + 0.15 * y + 2.0 * np.floor(x / 3.7)
        header = laspy.LasHeader(point_format=3, version="1.2")
        cloud = laspy.LasData(header)
        cloud.x, cloud.y, cloud.z = x, y, z
        cloud.classification = np.full(x.size, 2, dtype=np.uint8)
        cloud.write(run_dir / "lidar_subset.laz")
        return PocConfig.load(root, config_file), run_dir, np.column_stack((x, y, z))

    def _residual(self, resolution: str, root: Path) -> float:
        config, run_dir, points = self._run(root, resolution)
        _, terrain_grid = create_terrain(config, run_dir)
        grid = np.load(terrain_grid)
        step = float(resolution)
        columns = np.clip((points[:, 0] / step).astype(int), 0, grid.shape[1] - 1)
        rows = np.clip(((self.SIDE_M - points[:, 1]) / step).astype(int), 0, grid.shape[0] - 1)
        return float(np.percentile(np.abs(grid[rows, columns] - points[:, 2]), 95))

    def test_reduit_le_residu_aux_points_sol(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertLess(self._residual("0.5", root), self._residual("1", root))


class EnrichmentEdgeCaseTest(unittest.TestCase):
    def test_ignore_une_marge_negative(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, _ = _prepare_run(root, margin="-5")
            with self.assertRaises(ValueError):
                config.terrain_bbox


if __name__ == "__main__":
    unittest.main()
