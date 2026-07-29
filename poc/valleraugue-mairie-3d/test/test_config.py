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
