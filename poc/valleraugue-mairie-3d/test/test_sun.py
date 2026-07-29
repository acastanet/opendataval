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
    MAIRIE_LATITUDE,
    MAIRIE_LONGITUDE,
    elevation_for_azimuth,
    measure_ortho_offset,
    measure_ortho_sun,
    require_square_extent,
    shadow_azimuth,
    solar_position,
)


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
        return solar_position(MAIRIE_LATITUDE, MAIRIE_LONGITUDE, moment)

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
                MAIRIE_LATITUDE, MAIRIE_LONGITUDE, datetime(2024, 7, 15, hour, tzinfo=timezone.utc)
            )[0]
            for hour in range(6, 16)
        ]
        self.assertEqual(azimuths, sorted(azimuths))

    def test_recoupe_la_hauteur_a_partir_de_l_azimut(self) -> None:
        """La hauteur déduite de l'azimut doit rejoindre celle du calcul direct."""
        moment = datetime(2024, 7, 15, 8, tzinfo=timezone.utc)
        azimuth, elevation = solar_position(MAIRIE_LATITUDE, MAIRIE_LONGITUDE, moment)
        deduced = elevation_for_azimuth(MAIRIE_LATITUDE, azimuth, 21.5)
        self.assertAlmostEqual(deduced, elevation, delta=1.5)


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


class OrthoOffsetTest(unittest.TestCase):
    """L'orthophotographie n'est pas calée sur les données bâties : l'écart est constant."""

    SIDE_M = 40.0
    PIXELS = 400
    HEIGHT_M = 10.0

    def _run(self, root: Path, east_m: float, north_m: float) -> tuple[PocConfig, Path]:
        config_file = root / "poc.conf"
        config_file.write_text(
            f'POC_BBOX="0 0 {self.SIDE_M:g} {self.SIDE_M:g}"\nTERRAIN_MARGIN_M=0\n',
            encoding="utf-8",
        )
        run_dir = root / "run-test"
        (run_dir / "roofer_output").mkdir(parents=True)

        squares = [(x, y) for x in (10.0, 20.0, 30.0) for y in (12.0, 26.0)]
        resolution = self.SIDE_M / self.PIXELS
        image = Image.new("RGB", (self.PIXELS, self.PIXELS), (60, 70, 90))
        draw = ImageDraw.Draw(image)
        for x, y in squares:
            # La toiture est peinte décalée : c'est ce décalage que la mesure doit retrouver.
            left = x + east_m
            bottom = y + north_m
            draw.rectangle(
                [
                    (left - 2) / resolution,
                    (self.SIDE_M - (bottom + 2)) / resolution,
                    (left + 2) / resolution,
                    (self.SIDE_M - (bottom - 2)) / resolution,
                ],
                fill=(200, 120, 90),
            )
        image.save(run_dir / "orthophoto.jpg", quality=95)

        header = {"type": "CityJSON", "transform": {"scale": [1, 1, 1], "translate": [0, 0, 0]}}
        lines = [json.dumps(header)]
        for x, y in squares:
            corners = [(x - 2, y - 2), (x + 2, y - 2), (x + 2, y + 2), (x - 2, y + 2)]
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


if __name__ == "__main__":
    unittest.main()
