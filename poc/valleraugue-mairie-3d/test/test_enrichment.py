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
from poc3d.enrichment import create_terrain


def _prepare_run(root: Path, margin: str = "0") -> tuple[PocConfig, Path]:
    config_file = root / "poc.conf"
    config_file.write_text(
        'POC_BBOX="0 0 2 2"\n'
        "EXPECTED_WIDTH_M=2\n"
        "EXPECTED_HEIGHT_M=2\n"
        "TERRAIN_RESOLUTION_M=1\n"
        f"TERRAIN_MARGIN_M={margin}\n",
        encoding="utf-8",
    )
    run_dir = root / "run-test"
    run_dir.mkdir()

    header = laspy.LasHeader(point_format=3, version="1.2")
    cloud = laspy.LasData(header)
    cloud.x = np.array([0.25, 1.25, 0.25, 1.25])
    cloud.y = np.array([1.75, 1.75, 0.75, 0.75])
    cloud.z = np.array([10.0, 11.0, 12.0, 13.0])
    cloud.classification = np.array([2, 2, 2, 2], dtype=np.uint8)
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

    def test_ignore_une_marge_negative(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, _ = _prepare_run(root, margin="-5")
            with self.assertRaises(ValueError):
                config.terrain_bbox


if __name__ == "__main__":
    unittest.main()
