from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig, latest_run, read_shell_config


class ConfigTest(unittest.TestCase):
    def test_lit_la_configuration_historique(self) -> None:
        with TemporaryDirectory() as directory:
            source = Path(directory) / "poc.conf"
            source.write_text(
                'POC_BBOX="0 0 200 200"\nEXPECTED_WIDTH_M=200\n'
                "EXPECTED_HEIGHT_M=200\nOUTPUT_DIR=./output\n",
                encoding="utf-8",
            )
            values = read_shell_config(source)
            self.assertEqual(values["POC_BBOX"], "0 0 200 200")
            config = PocConfig.load(Path(directory), source)
            config.validate()
            self.assertEqual(config.expected_size, (200.0, 200.0))

    def test_refuse_une_dimension_incoherente(self) -> None:
        with TemporaryDirectory() as directory:
            source = Path(directory) / "poc.conf"
            source.write_text(
                'POC_BBOX="0 0 100 200"\nEXPECTED_WIDTH_M=200\n'
                "EXPECTED_HEIGHT_M=200\n",
                encoding="utf-8",
            )
            config = PocConfig.load(Path(directory), source)
            with self.assertRaisesRegex(ValueError, "Emprise attendue"):
                config.validate()

    def test_lit_l_identite_de_la_scene(self) -> None:
        with TemporaryDirectory() as directory:
            source = Path(directory) / "poc.conf"
            source.write_text(
                'SCENE_TITLE="Notre-Dame-de-la-Rouvière"\n'
                'SCENE_SUBTITLE="Val-d\'Aigoual · IGN LiDAR HD"\n'
                'SCENE_CENTRE_LABEL="Place Auguste Vidal"\n'
                'SCENE_CENTRE_WGS84="44.048776 3.700904"\n',
                encoding="utf-8",
            )
            config = PocConfig.load(Path(directory), source)
            self.assertEqual(config.scene_title, "Notre-Dame-de-la-Rouvière")
            self.assertEqual(config.scene_centre_label, "Place Auguste Vidal")
            self.assertEqual(config.scene_centre_wgs84, (44.048776, 3.700904))

    def test_refuse_un_centre_mal_forme(self) -> None:
        """Le centre n'est que documentaire, mais un couple incomplet trahit une saisie
        interrompue : mieux vaut le dire à la validation qu'au moment de le relire."""
        with TemporaryDirectory() as directory:
            source = Path(directory) / "poc.conf"
            source.write_text(
                'POC_BBOX="0 0 100 100"\nEXPECTED_WIDTH_M=100\nEXPECTED_HEIGHT_M=100\n'
                'SCENE_CENTRE_WGS84="44.048776"\n',
                encoding="utf-8",
            )
            config = PocConfig.load(Path(directory), source)
            with self.assertRaisesRegex(ValueError, "SCENE_CENTRE_WGS84"):
                config.validate()

    def test_toutes_les_configurations_versionnees_portent_un_titre(self) -> None:
        """Sans titre, une scène n'apparaît dans le sélecteur que par sa taille — et deux
        communes modélisées au même format y deviennent indiscernables."""
        for source in sorted((ROOT / "config").glob("*.conf")):
            with self.subTest(configuration=source.name):
                config = PocConfig.load(ROOT, source)
                config.validate()
                self.assertTrue(config.scene_title, f"{source.name} sans SCENE_TITLE")
                example = source.with_suffix(".conf.example")
                self.assertTrue(example.is_file(), f"{source.name} sans .example")
                self.assertEqual(
                    source.read_text(encoding="utf-8"),
                    example.read_text(encoding="utf-8"),
                    f"{source.name} a divergé de son .example",
                )

    def test_selectionne_la_derniere_execution_complete(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "poc.conf"
            source.write_text('OUTPUT_DIR="./output"\n', encoding="utf-8")
            incomplete = root / "output" / "run-2"
            complete = root / "output" / "run-1" / "roofer_output"
            incomplete.mkdir(parents=True)
            complete.mkdir(parents=True)
            (complete / "scene.city.jsonl").write_text("{}\n", encoding="utf-8")
            config = PocConfig.load(root, source)
            self.assertEqual(latest_run(config, require_complete=True).name, "run-1")


if __name__ == "__main__":
    unittest.main()
