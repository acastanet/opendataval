from pathlib import Path
from tempfile import TemporaryDirectory
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.scene import (
    MAX_ORTHO_SIZE_PX,
    SceneRequest,
    default_ortho_size,
    default_terrain_resolution,
    plan_scene,
    slugify,
    write_scene,
)


def _request(**overrides: object) -> SceneRequest:
    defaults: dict[str, object] = {
        "latitude": 44.048777,
        "longitude": 3.700903,
        "side_m": 200.0,
        "title": "Notre-Dame-de-la-Rouvière",
    }
    defaults.update(overrides)
    return SceneRequest(**defaults)  # type: ignore[arg-type]


class SlugTest(unittest.TestCase):
    def test_reduit_les_accents_au_lieu_de_les_supprimer(self) -> None:
        self.assertEqual(slugify("Notre-Dame-de-la-Rouvière"), "notre-dame-de-la-rouviere")
        self.assertEqual(slugify("Val-d'Aigoual"), "val-d-aigoual")

    def test_refuse_un_intitule_sans_lettre(self) -> None:
        with self.assertRaisesRegex(ValueError, "identifiant"):
            slugify("···")


class DefaultsTest(unittest.TestCase):
    def test_reproduit_les_reglages_des_emprises_de_reference(self) -> None:
        """Les valeurs par défaut sont calibrées sur les trois emprises déjà mesurées : si
        elles ne les redonnaient pas, elles ne seraient pas des valeurs par défaut."""
        self.assertEqual(default_terrain_resolution(100), 0.5)
        self.assertEqual(default_terrain_resolution(200), 0.5)
        self.assertEqual(default_terrain_resolution(600), 1.0)
        self.assertEqual(default_ortho_size(130), 1024)
        self.assertEqual(default_ortho_size(230), 2048)
        self.assertEqual(default_ortho_size(630), MAX_ORTHO_SIZE_PX)


class PlanSceneTest(unittest.TestCase):
    def test_calcule_l_emprise_demandee(self) -> None:
        plan = plan_scene(_request())
        self.assertEqual(plan.bbox, (756068.0, 6327902.0, 756268.0, 6328102.0))
        self.assertEqual(plan.terrain_bbox, (756053.0, 6327887.0, 756283.0, 6328117.0))
        self.assertEqual(plan.identifier, "notre-dame-de-la-rouviere-200m")
        self.assertEqual(plan.terrain_resolution_m, 0.5)
        self.assertEqual(plan.ortho_size_px, 2048)
        self.assertEqual(plan.terrain_cells, 211600)
        self.assertEqual(plan.output_dir, "./output-notre-dame-de-la-rouviere-200m")

    def test_signale_les_dalles_a_telecharger_sans_bloquer(self) -> None:
        """Deux dalles, c'est 600 Mo : un coût à annoncer, pas une erreur à lever."""
        plan = plan_scene(_request())
        self.assertEqual(plan.tiles, ["LHD_FXX_0756_6329", "LHD_FXX_0756_6328"])
        self.assertTrue(any("2 dalles" in warning for warning in plan.warnings))

    def test_ne_signale_rien_sur_une_emprise_ordinaire(self) -> None:
        plan = plan_scene(_request(latitude=44.081089, longitude=3.641219, title="Valleraugue"))
        self.assertEqual(plan.tiles, ["LHD_FXX_0751_6332"])
        self.assertEqual(plan.warnings, [])

    def test_avertit_d_une_scene_trop_lourde(self) -> None:
        """Un kilomètre de côté à la maille fine : quatre millions de mailles, une scène
        d'un demi-gigaoctet. Rien d'invalide, mais on ne le lance pas sans le savoir."""
        plan = plan_scene(_request(side_m=1000.0, terrain_resolution_m=0.5))
        self.assertTrue(any("mailles" in warning for warning in plan.warnings))

    def test_refuse_une_taille_d_orthophoto_hors_bornes(self) -> None:
        with self.assertRaisesRegex(ValueError, "ORTHO_SIZE_PX"):
            plan_scene(_request(ortho_size_px=8192))

    def test_refuse_une_marge_negative(self) -> None:
        with self.assertRaisesRegex(ValueError, "marge"):
            plan_scene(_request(terrain_margin_m=-1.0))

    def test_rend_un_contrat_json_serialisable(self) -> None:
        """`as_dict` est ce qu'une interface de construction consomme : elle doit pouvoir le
        recevoir tel quel, sans encodeur maison."""
        payload = json.loads(json.dumps(plan_scene(_request()).as_dict(), ensure_ascii=False))
        self.assertEqual(payload["bbox"], [756068.0, 6327902.0, 756268.0, 6328102.0])
        self.assertEqual(len(payload["footprintWgs84"]), 5)
        self.assertIn("--bbox 756068 6327902 756268 6328102", payload["upstreamCommand"])
        self.assertEqual(payload["estimates"]["lidarDownloadMb"], 600)


class WriteSceneTest(unittest.TestCase):
    def test_ecrit_une_configuration_relisible_par_le_pipeline(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            plan = plan_scene(_request(identifier="ndr-200m"))
            written = write_scene(plan, root)
            self.assertEqual(
                sorted(path.name for path in written),
                ["ndr-200m.conf", "ndr-200m.conf.example", "ndr-200m.geojson"],
            )
            config = PocConfig.load(root, root / "config" / "ndr-200m.conf")
            config.validate()
            self.assertEqual(config.bbox, (756068.0, 6327902.0, 756268.0, 6328102.0))
            self.assertEqual(config.scene_title, "Notre-Dame-de-la-Rouvière")
            self.assertEqual(config.scene_centre_wgs84, (44.048776, 3.700904))

    def test_garde_le_conf_et_son_example_identiques(self) -> None:
        """Les avoir laissés diverger avait déjà rendu une correction sans effet."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            write_scene(plan_scene(_request(identifier="ndr-200m")), root)
            configuration = (root / "config" / "ndr-200m.conf").read_text(encoding="utf-8")
            example = (root / "config" / "ndr-200m.conf.example").read_text(encoding="utf-8")
            self.assertEqual(configuration, example)

    def test_refuse_d_ecraser_sans_le_demander(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            plan = plan_scene(_request(identifier="ndr-200m"))
            write_scene(plan, root)
            with self.assertRaisesRegex(FileExistsError, "--overwrite"):
                write_scene(plan, root)
            write_scene(plan, root, overwrite=True)

    def test_ecrit_un_apercu_geojson_exploitable(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            write_scene(plan_scene(_request(identifier="ndr-200m")), root)
            document = json.loads(
                (root / "config" / "ndr-200m.geojson").read_text(encoding="utf-8")
            )
            roles = [feature["properties"]["role"] for feature in document["features"]]
            self.assertEqual(roles, ["scene_centre", "processing_bbox"])
            ring = document["features"][1]["geometry"]["coordinates"][0]
            self.assertEqual(ring[0], ring[-1])


if __name__ == "__main__":
    unittest.main()
