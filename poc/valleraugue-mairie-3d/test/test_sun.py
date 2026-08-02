from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import sys
import unittest

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.sun import (
    elevation_for_azimuth,
    measure_ortho_offset,
    measure_ortho_sun,
    require_square_extent,
    scene_latitude,
    shadow_azimuth,
    solar_position,
)

REFERENCE_LATITUDE = 44.081192
REFERENCE_LONGITUDE = 3.641467


class SquareExtentTest(unittest.TestCase):
    """La calibration raisonne en pixels carrés : sur une emprise large, elle mentirait."""

    def _config(self, root: Path, bbox: str, extra: str = "") -> PocConfig:
        config_file = root / "poc.conf"
        config_file.write_text(
            f'POC_BBOX="{bbox}"\nTERRAIN_MARGIN_M=15\n' + extra, encoding="utf-8"
        )
        return PocConfig.load(root, config_file)

    def test_accepte_une_emprise_carree(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(root, "751256 6331451 751456 6331651")
            self.assertIsNone(require_square_extent(config))

    def test_refuse_une_emprise_rectangulaire(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(root, "751056 6331401 751656 6331701")
            with self.assertRaises(RuntimeError) as raised:
                require_square_extent(config)
            self.assertIn("630", str(raised.exception))
            self.assertIn("330", str(raised.exception))

    def test_la_configuration_forcee_court_circuite_le_controle(self) -> None:
        """Une emprise large reste exploitable si le calage est renseigné à la main."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(
                root,
                "751056 6331401 751656 6331701",
                "ORTHO_SUN_AZIMUTH_DEG=95\nORTHO_SUN_ELEVATION_DEG=35\n"
                "ORTHO_OFFSET_EAST=-0.34\nORTHO_OFFSET_NORTH=-2.58\n",
            )
            run_dir = root / "run-test"
            run_dir.mkdir()
            sun = measure_ortho_sun(config, run_dir)
            self.assertEqual(sun.source, "configuration")
            self.assertAlmostEqual(sun.azimuth_deg, 95.0)
            offset = measure_ortho_offset(config, run_dir)
            self.assertEqual(offset.source, "configuration")
            self.assertAlmostEqual(offset.north_m, -2.58)


class SolarPositionTest(unittest.TestCase):
    """Contrôlé sur des valeurs de référence : h = 90 - latitude + déclinaison à midi solaire."""

    def _noon(self, month: int, day: int) -> tuple[float, float]:
        moment = datetime(2024, month, day, 11, 45, tzinfo=timezone.utc)
        return solar_position(REFERENCE_LATITUDE, REFERENCE_LONGITUDE, moment)

    def test_hauteur_au_solstice_d_ete(self) -> None:
        azimuth, elevation = self._noon(6, 21)
        self.assertAlmostEqual(elevation, 69.4, delta=0.5)
        self.assertAlmostEqual(azimuth, 180.0, delta=3.0)

    def test_hauteur_au_solstice_d_hiver(self) -> None:
        _, elevation = self._noon(12, 21)
        self.assertAlmostEqual(elevation, 22.5, delta=0.5)

    def test_hauteur_a_l_equinoxe(self) -> None:
        _, elevation = self._noon(3, 20)
        self.assertAlmostEqual(elevation, 45.9, delta=0.5)

    def test_l_azimut_croit_au_fil_de_la_journee(self) -> None:
        azimuths = [
            solar_position(
                REFERENCE_LATITUDE,
                REFERENCE_LONGITUDE,
                datetime(2024, 7, 15, hour, tzinfo=timezone.utc),
            )[0]
            for hour in range(6, 16)
        ]
        self.assertEqual(azimuths, sorted(azimuths))

    def test_recoupe_la_hauteur_a_partir_de_l_azimut(self) -> None:
        """La hauteur déduite de l'azimut doit rejoindre celle du calcul direct."""
        moment = datetime(2024, 7, 15, 8, tzinfo=timezone.utc)
        azimuth, elevation = solar_position(REFERENCE_LATITUDE, REFERENCE_LONGITUDE, moment)
        deduced = elevation_for_azimuth(REFERENCE_LATITUDE, azimuth, 21.5)
        self.assertAlmostEqual(deduced, elevation, delta=1.5)


class SceneLatitudeTest(unittest.TestCase):
    def _config(self, root: Path, centre: str | None) -> PocConfig:
        source = root / "poc.conf"
        value = f'SCENE_CENTRE_WGS84="{centre}"\n' if centre else ""
        source.write_text(
            'POC_BBOX="700000 6600000 700200 6600200"\nTERRAIN_MARGIN_M=0\n' + value,
            encoding="utf-8",
        )
        return PocConfig.load(root, source)

    def test_deux_latitudes_donnent_deux_hauteurs_solaires(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            south = scene_latitude(self._config(root, "43.0 3.0"))
            north = scene_latitude(self._config(root, "49.0 3.0"))
            self.assertNotAlmostEqual(
                elevation_for_azimuth(south, 100.0, 20.0),
                elevation_for_azimuth(north, 100.0, 20.0),
            )

    def test_retombe_sur_le_centre_de_la_bbox(self) -> None:
        with TemporaryDirectory() as directory:
            latitude = scene_latitude(self._config(Path(directory), None))
            self.assertAlmostEqual(latitude, 46.5009, places=3)


class ShadowAzimuthTest(unittest.TestCase):
    """La direction des ombres est la seule grandeur solaire réellement mesurable ici."""

    def _scene(self, shadow_columns: int, shadow_rows: int) -> tuple[np.ndarray, np.ndarray]:
        size = 200
        mask = np.zeros((size, size), dtype=bool)
        for row in range(20, 180, 40):
            for column in range(20, 180, 40):
                mask[row : row + 10, column : column + 10] = True
        luminance = np.full((size, size), 200.0)
        shadow = np.zeros_like(mask)
        source_rows = slice(max(0, -shadow_rows), size - max(0, shadow_rows))
        target_rows = slice(max(0, shadow_rows), size - max(0, -shadow_rows))
        source_columns = slice(max(0, -shadow_columns), size - max(0, shadow_columns))
        target_columns = slice(max(0, shadow_columns), size - max(0, -shadow_columns))
        shadow[target_rows, target_columns] = mask[source_rows, source_columns]
        luminance[shadow & ~mask] = 40.0
        return luminance, mask

    def test_retrouve_une_ombre_portee_vers_l_ouest(self) -> None:
        # Colonne décroissante = ouest, ligne inchangée : azimut 270°.
        luminance, mask = self._scene(shadow_columns=-10, shadow_rows=0)
        self.assertEqual(shadow_azimuth(luminance, mask, 0.5), 270.0)

    def test_retrouve_une_ombre_portee_vers_le_nord(self) -> None:
        # La ligne croît vers le sud : une ombre au nord décale vers les lignes basses.
        luminance, mask = self._scene(shadow_columns=0, shadow_rows=-10)
        self.assertEqual(shadow_azimuth(luminance, mask, 0.5), 0.0)

    def test_refuse_une_image_sans_bati(self) -> None:
        with self.assertRaises(RuntimeError):
            shadow_azimuth(np.full((200, 200), 120.0), np.zeros((200, 200), dtype=bool), 0.5)

    def test_refuse_une_image_sans_ombre_portee(self) -> None:
        """Aucune direction ne se détache : il n'y a rien à mesurer, et rien à inventer."""
        _, mask = self._scene(shadow_columns=0, shadow_rows=0)
        with self.assertRaises(RuntimeError):
            shadow_azimuth(np.full(mask.shape, 180.0), mask, 0.5)


class OrthoOffsetScene(unittest.TestCase):
    """Gabarit de scène synthétique, partagé par les mesures et par leurs refus."""

    SIDE_M = 40.0
    PIXELS = 400
    HEIGHT_M = 10.0

    def _run(
        self,
        root: Path,
        east_m: float,
        north_m: float,
        *,
        half_m: float = 2.0,
        roof: tuple[int, int, int] = (200, 120, 90),
        background: tuple[int, int, int] | np.ndarray = (60, 70, 90),
    ) -> tuple[PocConfig, Path]:
        config_file = root / "poc.conf"
        config_file.write_text(
            f'POC_BBOX="0 0 {self.SIDE_M:g} {self.SIDE_M:g}"\nTERRAIN_MARGIN_M=0\n',
            encoding="utf-8",
        )
        run_dir = root / "run-test"
        (run_dir / "roofer_output").mkdir(parents=True)

        squares = [(x, y) for x in (10.0, 20.0, 30.0) for y in (12.0, 26.0)]
        resolution = self.SIDE_M / self.PIXELS
        image = (
            Image.fromarray(background)
            if isinstance(background, np.ndarray)
            else Image.new("RGB", (self.PIXELS, self.PIXELS), background)
        )
        draw = ImageDraw.Draw(image)
        for x, y in squares:
            # La toiture est peinte décalée : c'est ce décalage que la mesure doit retrouver.
            left = x + east_m
            bottom = y + north_m
            draw.rectangle(
                [
                    (left - half_m) / resolution,
                    (self.SIDE_M - (bottom + half_m)) / resolution,
                    (left + half_m) / resolution,
                    (self.SIDE_M - (bottom - half_m)) / resolution,
                ],
                fill=roof,
            )
        image.save(run_dir / "orthophoto.jpg", quality=95)

        header = {"type": "CityJSON", "transform": {"scale": [1, 1, 1], "translate": [0, 0, 0]}}
        lines = [json.dumps(header)]
        for x, y in squares:
            corners = [
                (x - half_m, y - half_m),
                (x + half_m, y - half_m),
                (x + half_m, y + half_m),
                (x - half_m, y + half_m),
            ]
            lines.append(
                json.dumps(
                    {
                        "vertices": [[cx, cy, 0] for cx, cy in corners] + [[x, y, self.HEIGHT_M]],
                        "CityObjects": {
                            "part": {
                                "geometry": [
                                    {
                                        "type": "MultiSurface",
                                        "lod": "2.2",
                                        "boundaries": [[[0, 1, 2, 3]]],
                                        "semantics": {
                                            "surfaces": [{"type": "GroundSurface"}],
                                            "values": [0],
                                        },
                                    }
                                ]
                            }
                        },
                    }
                )
            )
        (run_dir / "roofer_output" / "test.city.jsonl").write_text(
            "\n".join(lines) + "\n", encoding="utf-8"
        )
        return PocConfig.load(root, config_file), run_dir


class OrthoOffsetTest(OrthoOffsetScene):
    """L'orthophotographie n'est pas calée sur les données bâties : l'écart est constant."""

    def test_retrouve_un_decalage_vers_le_sud(self) -> None:
        """Cas réel du site : l'orthophoto est décalée de quelques mètres vers le sud."""
        with TemporaryDirectory() as directory:
            config, run_dir = self._run(Path(directory), -0.3, -2.6)
            offset = measure_ortho_offset(config, run_dir)
            self.assertAlmostEqual(offset.east_m, -0.3, delta=0.2)
            self.assertAlmostEqual(offset.north_m, -2.6, delta=0.2)

    def test_retrouve_un_decalage_vers_le_nord_est(self) -> None:
        with TemporaryDirectory() as directory:
            config, run_dir = self._run(Path(directory), 1.8, 2.4)
            offset = measure_ortho_offset(config, run_dir)
            self.assertAlmostEqual(offset.east_m, 1.8, delta=0.2)
            self.assertAlmostEqual(offset.north_m, 2.4, delta=0.2)

    def test_ne_decale_rien_sur_une_image_deja_calee(self) -> None:
        with TemporaryDirectory() as directory:
            config, run_dir = self._run(Path(directory), 0.0, 0.0)
            offset = measure_ortho_offset(config, run_dir)
            self.assertAlmostEqual(offset.east_m, 0.0, delta=0.2)
            self.assertAlmostEqual(offset.north_m, 0.0, delta=0.2)

    def test_respecte_une_valeur_forcee_en_configuration(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            _, run_dir = self._run(root, -0.3, -2.6)
            forced = root / "forced.conf"
            forced.write_text(
                f'POC_BBOX="0 0 {self.SIDE_M:g} {self.SIDE_M:g}"\n'
                "ORTHO_OFFSET_EAST=-1.5\nORTHO_OFFSET_NORTH=0.25\n",
                encoding="utf-8",
            )
            offset = measure_ortho_offset(PocConfig.load(root, forced), run_dir)
            self.assertEqual((offset.east_m, offset.north_m), (-1.5, 0.25))
            self.assertEqual(offset.source, "configuration")


class OrthoOffsetRefusalTest(OrthoOffsetScene):
    """Le critère colorimétrique n'a pas prise partout : mieux vaut le dire que le forcer.

    Chacun de ces cas rendait auparavant une translation d'aspect normal, appliquée sans
    réserve à la texture du terrain comme à celle des toitures.
    """

    def test_refuse_des_toitures_moins_rouges_que_leur_environnement(self) -> None:
        """Le cas du causse : toits de tôle grise sur un sol ocre, contraste inversé."""
        with TemporaryDirectory() as directory:
            config, run_dir = self._run(
                Path(directory), 0.0, 0.0, roof=(140, 140, 145), background=(190, 170, 120)
            )
            with self.assertRaises(RuntimeError):
                measure_ortho_offset(config, run_dir)

    def test_refuse_une_surface_batie_trop_faible(self) -> None:
        """Assez d'emprises pour la borne d'avant, trop peu de pixels pour une translation."""
        with TemporaryDirectory() as directory:
            config, run_dir = self._run(Path(directory), 0.0, 0.0, half_m=0.6)
            with self.assertRaises(RuntimeError):
                measure_ortho_offset(config, run_dir)

    def test_refuse_un_optimum_pose_sur_la_borne_du_domaine(self) -> None:
        """Un fond dont la teinte croît sans fin vers l'est : le critère y monte encore au bord.

        C'est la forme qu'avait prise le défaut en production — le score croissait de façon
        monotone jusqu'à la borne, et la valeur rendue était celle de la borne elle-même.
        """
        with TemporaryDirectory() as directory:
            columns = np.linspace(0.0, 255.0, self.PIXELS)
            red = np.tile(columns, (self.PIXELS, 1))
            gradient = np.stack([red, np.full_like(red, 120.0), 255.0 - red], axis=-1)
            config, run_dir = self._run(
                Path(directory),
                0.0,
                0.0,
                roof=(255, 120, 215),  # rouge moins bleu de +40 : moins que le gain du fond
                background=gradient.astype(np.uint8),
            )
            with self.assertRaises(RuntimeError):
                measure_ortho_offset(config, run_dir)


class CrossCheckedSunTest(OrthoOffsetScene):
    """L'azimut du bâti se confirme sur les houppiers, ou ne se retient pas.

    Là où le bâti est maigre, sa direction d'ombre dérive sans que la netteté du creux le
    trahisse : au Col de Perjuret, cinq bâtiments donnaient le creux le plus marqué de toutes
    les scènes du POC, et pourtant seule une seconde source pouvait le confirmer.
    """

    def _with_shadows(self, root: Path, bearing_deg: float) -> tuple[PocConfig, Path]:
        """Scène dont les toitures portent une ombre dans la direction demandée."""
        config, run_dir = self._run(root, 0.0, 0.0)
        resolution = self.SIDE_M / self.PIXELS
        image = Image.open(run_dir / "orthophoto.jpg").convert("RGB")
        draw = ImageDraw.Draw(image)
        east = 4.0 * np.sin(np.radians(bearing_deg))
        north = 4.0 * np.cos(np.radians(bearing_deg))
        for x in (10.0, 20.0, 30.0):
            for y in (12.0, 26.0):
                draw.rectangle(
                    [
                        (x - 2 + east) / resolution,
                        (self.SIDE_M - (y + 2 + north)) / resolution,
                        (x + 2 + east) / resolution,
                        (self.SIDE_M - (y - 2 + north)) / resolution,
                    ],
                    fill=(20, 20, 25),
                )
                draw.rectangle(
                    [
                        (x - 2) / resolution,
                        (self.SIDE_M - (y + 2)) / resolution,
                        (x + 2) / resolution,
                        (self.SIDE_M - (y - 2)) / resolution,
                    ],
                    fill=(200, 120, 90),
                )
        image.save(run_dir / "orthophoto.jpg", quality=95)
        return config, run_dir

    # Les houppiers occupent la bande nord de l'emprise, à l'écart des toitures, et portent une
    # ombre continue plutôt qu'une tache : c'est ce que la mesure échantillonne, à plusieurs
    # fractions de la hauteur de l'arbre.
    TREE_HEIGHT_M = 5.0
    TREE_CROWN_M = 2.5
    SHADOW_LENGTHS_M = (2.0, 3.5, 5.0, 6.5)

    def _write_trees(self, run_dir: Path, bearing_deg: float) -> None:
        """Pose des houppiers dont les ombres portent dans la direction demandée."""
        image = Image.open(run_dir / "orthophoto.jpg").convert("RGB")
        draw = ImageDraw.Draw(image)
        resolution = self.SIDE_M / self.PIXELS
        radius = self.TREE_CROWN_M
        trees = []
        for x in (8.0, 14.0, 20.0, 26.0, 32.0):
            for y in (32.0, 37.0):
                for length in self.SHADOW_LENGTHS_M:
                    east = length * np.sin(np.radians(bearing_deg))
                    north = length * np.cos(np.radians(bearing_deg))
                    draw.ellipse(
                        [
                            (x - radius + east) / resolution,
                            (self.SIDE_M - (y + radius + north)) / resolution,
                            (x + radius + east) / resolution,
                            (self.SIDE_M - (y - radius + north)) / resolution,
                        ],
                        fill=(20, 20, 25),
                    )
                trees.append(
                    {
                        "x": x,
                        "y": y,
                        "ground": 0.0,
                        "height": self.TREE_HEIGHT_M,
                        "crown": radius,
                    }
                )
        image.save(run_dir / "orthophoto.jpg", quality=95)
        (run_dir / "trees.json").write_text(
            json.dumps({"count": len(trees), "trees": trees}), encoding="utf-8"
        )

    def test_retient_un_azimut_que_les_houppiers_confirment(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = self._with_shadows(root, 270.0)
            self._write_trees(run_dir, 270.0)
            sun = measure_ortho_sun(config, run_dir)
            self.assertAlmostEqual(sun.azimuth_deg, 90.0, delta=10.0)
            self.assertIn("houppiers", sun.source)

    def test_refuse_des_ombres_contradictoires(self) -> None:
        """Ombres du bâti vers l'ouest, des houppiers vers l'est : les deux ne peuvent pas
        valoir ensemble, et rien ne dit laquelle des deux se trompe."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = self._with_shadows(root, 270.0)
            self._write_trees(run_dir, 90.0)
            with self.assertRaises(RuntimeError):
                measure_ortho_sun(config, run_dir)

    def test_se_contente_du_bati_sans_vegetation(self) -> None:
        """Une scène sans végétation reste calibrable : la provenance le dit, sans plus."""
        with TemporaryDirectory() as directory:
            config, run_dir = self._with_shadows(Path(directory), 270.0)
            sun = measure_ortho_sun(config, run_dir)
            self.assertAlmostEqual(sun.azimuth_deg, 90.0, delta=10.0)
            self.assertNotIn("houppiers", sun.source)


if __name__ == "__main__":
    unittest.main()
