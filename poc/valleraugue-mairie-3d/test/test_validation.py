from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock
import json
import sys
import unittest

import laspy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.validation import (
    REQUIRED_ARTIFACTS,
    coverage_deficit,
    coverage_margins,
    validate_run,
)


TERRAIN_BBOX = (0.0, 0.0, 100.0, 100.0)


def _write_cloud(path: Path, bounds: tuple[float, float, float, float]) -> None:
    """Écrit un nuage minimal dont l'en-tête porte exactement l'emprise demandée."""
    xmin, ymin, xmax, ymax = bounds
    header = laspy.LasHeader(point_format=3, version="1.2")
    cloud = laspy.LasData(header)
    cloud.x = np.array([xmin, xmax, xmin, xmax])
    cloud.y = np.array([ymin, ymin, ymax, ymax])
    cloud.z = np.array([10.0, 11.0, 12.0, 13.0])
    cloud.classification = np.full(4, 2, dtype=np.uint8)
    cloud.write(path)


def _prepare_run(root: Path, cloud_bounds: tuple[float, float, float, float] | None) -> tuple[PocConfig, Path]:
    config_file = root / "poc.conf"
    config_file.write_text(
        'POC_BBOX="0 0 100 100"\n'
        "EXPECTED_WIDTH_M=100\nEXPECTED_HEIGHT_M=100\n"
        "TERRAIN_MARGIN_M=0\nTERRAIN_RESOLUTION_M=1\n"
        'OUTPUT_DIR="./output"\n',
        encoding="utf-8",
    )
    run_dir = root / "output" / "run-test"
    (run_dir / "roofer_output").mkdir(parents=True)
    for name in REQUIRED_ARTIFACTS:
        (run_dir / name).write_bytes(b"x")
    (run_dir / "roofer_output" / "scene.city.jsonl").write_text("{}\n", encoding="utf-8")
    if cloud_bounds is not None:
        _write_cloud(run_dir / "lidar_subset.laz", cloud_bounds)
    return PocConfig.load(root, config_file), run_dir


def _report_of_failed_run(
    case: unittest.TestCase, cloud_bounds: tuple[float, float, float, float] | None
) -> str:
    with TemporaryDirectory() as directory:
        root = Path(directory)
        config, run_dir = _prepare_run(root, cloud_bounds)
        with case.assertRaises(RuntimeError):
            validate_run(config, run_dir)
        return (run_dir / "poc-validation.md").read_text(encoding="utf-8")


class CoverageArithmeticTest(unittest.TestCase):
    """La couverture est mesurée par une fonction pure : c'est elle que les tests interrogent."""

    def test_compte_les_marges_cote_par_cote(self) -> None:
        margins = coverage_margins((-2.0, -3.0, 105.0, 101.0), TERRAIN_BBOX)
        self.assertEqual(
            margins, {"ouest": 2.0, "sud": 3.0, "est": 5.0, "nord": 1.0}
        )

    def test_ne_signale_que_les_cotes_deficitaires(self) -> None:
        deficit = coverage_deficit((10.0, -5.0, 200.0, 200.0), TERRAIN_BBOX, tolerance=1.0)
        self.assertEqual(deficit, {"ouest": 10.0})

    def test_absout_un_manque_inferieur_a_la_maille(self) -> None:
        """En dessous d'une cellule, aucune valeur du MNT ne change : rien à signaler."""
        self.assertEqual(
            coverage_deficit((0.4, 0.4, 99.6, 99.6), TERRAIN_BBOX, tolerance=1.0), {}
        )


class ValidationTest(unittest.TestCase):
    def test_valide_les_artefacts_observables(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = _prepare_run(root, (-5.0, -5.0, 105.0, 105.0))
            report = validate_run(config, run_dir)
            content = report.read_text(encoding="utf-8")
            self.assertIn("PASS technique", content)
            self.assertIn("Le nuage couvre le terrain", content)

    def test_titre_le_rapport_avec_le_nom_de_la_scene(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = _prepare_run(root, (-5.0, -5.0, 105.0, 105.0))
            config.source.write_text(
                config.source.read_text(encoding="utf-8")
                + 'SCENE_TITLE="Creyssensac-et-Pissot"\n',
                encoding="utf-8",
            )
            report = validate_run(PocConfig.load(root, config.source), run_dir)
            content = report.read_text(encoding="utf-8")
            self.assertIn("# Validation — Creyssensac-et-Pissot", content)
            self.assertNotIn("mairie de Valleraugue", content)

    def test_resume_le_rendu_quand_la_scene_existe(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = _prepare_run(root, (-5.0, -5.0, 105.0, 105.0))
            render = run_dir / "render"
            render.mkdir()
            (render / "scene.json").write_text(
                json.dumps(
                    {
                        "buildings": 12,
                        "roofQuality": {"total": 12, "degraded": ["a", "b"]},
                        "orthoOffset": {"eastMetres": 3.0, "northMetres": 4.0},
                        "medianViewFactor": 0.625,
                    }
                ),
                encoding="utf-8",
            )
            (run_dir / "trees.json").write_text(
                json.dumps(
                    {
                        "count": 20,
                        "foliage": {"deciduous": 7, "mixed": 5, "generic": 8},
                    }
                ),
                encoding="utf-8",
            )
            content = validate_run(config, run_dir).read_text(encoding="utf-8")
            self.assertIn("## Rendu", content)
            self.assertIn("Toitures dégradées : 2/12", content)
            self.assertIn("5.00 m", content)
            self.assertIn("20, dont 12 typés BD Forêt", content)
            self.assertIn("0.625", content)

    def test_omet_le_rendu_avant_l_assemblage_glb(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = _prepare_run(root, (-5.0, -5.0, 105.0, 105.0))
            content = validate_run(config, run_dir).read_text(encoding="utf-8")
            self.assertNotIn("## Rendu", content)

    def test_refuse_un_nuage_plus_court_que_le_terrain(self) -> None:
        """Le cas que rien ne détectait : le MNT y aurait inventé un relief plausible."""
        content = _report_of_failed_run(self, (30.0, -5.0, 105.0, 105.0))
        self.assertIn("FAIL technique", content)
        self.assertIn("ne couvre pas l'emprise du terrain", content)
        self.assertIn("ouest : 30.0 m manquants", content)

    def test_refuse_un_nuage_illisible(self) -> None:
        content = _report_of_failed_run(self, None)
        self.assertIn("Nuage illisible", content)
        self.assertIn("FAIL technique", content)

    def test_ne_bloque_pas_sans_laspy(self) -> None:
        """La validation reste utilisable sans la pile scientifique : la mesure est omise."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config, run_dir = _prepare_run(root, (-5.0, -5.0, 105.0, 105.0))
            with mock.patch("poc3d.validation._cloud_bounds", side_effect=ImportError):
                report = validate_run(config, run_dir)
            content = report.read_text(encoding="utf-8")
            self.assertIn("PASS technique", content)
            self.assertIn("`laspy` est absent", content)


if __name__ == "__main__":
    unittest.main()
