from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.validation import REQUIRED_ARTIFACTS, validate_run


class ValidationTest(unittest.TestCase):
    def test_valide_les_artefacts_observables(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config_file = root / "poc.conf"
            config_file.write_text(
                'POC_BBOX="0 0 100 100"\nOUTPUT_DIR="./output"\n',
                encoding="utf-8",
            )
            run_dir = root / "output" / "run-test"
            (run_dir / "roofer_output").mkdir(parents=True)
            for name in REQUIRED_ARTIFACTS:
                (run_dir / name).write_bytes(b"x")
            (run_dir / "roofer_output" / "scene.city.jsonl").write_text(
                "{}\n", encoding="utf-8"
            )
            config = PocConfig.load(root, config_file)
            report = validate_run(config, run_dir)
            self.assertIn("PASS technique", report.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
