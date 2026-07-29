from pathlib import Path
from tempfile import TemporaryDirectory
from html.parser import HTMLParser
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.web import available_scenes, latest_scene_run


class _InterfaceParser(HTMLParser):
    """Lit la structure du panneau : deux niveaux, le second seul étant pliable."""

    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.render_modes: set[str] = set()
        self.accordions = 0
        self.expert_accordions = 0
        self.first_level_sections = 0
        self.render_modes_in_expert = False
        self._details_depth = 0
        self._expert_depth: int | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = str(values.get("class", "")).split()
        if values.get("id"):
            self.ids.add(str(values["id"]))
        if tag == "section" and "controls" in classes:
            self.first_level_sections += 1
        if tag == "details":
            self._details_depth += 1
            if "expert" in classes:
                self._expert_depth = self._details_depth
            if "accordion" in classes:
                self.accordions += 1
                if self._expert_depth is not None:
                    self.expert_accordions += 1
        if tag == "input" and values.get("name") == "renderMode" and values.get("value"):
            self.render_modes.add(str(values["value"]))
            if self._expert_depth is not None:
                self.render_modes_in_expert = True

    def handle_endtag(self, tag: str) -> None:
        if tag != "details":
            return
        if self._expert_depth == self._details_depth:
            self._expert_depth = None
        self._details_depth -= 1


def _write_config(root: Path, name: str, side: int, output: str) -> Path:
    source = root / "config" / f"{name}.conf"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_text(
        f'POC_BBOX="0 0 {side} {side}"\n'
        f"EXPECTED_WIDTH_M={side}\nEXPECTED_HEIGHT_M={side}\n"
        f'OUTPUT_DIR="./{output}"\n',
        encoding="utf-8",
    )
    return source


def _write_run(root: Path, output: str, name: str, *, scene: bool, roofer: bool = True) -> Path:
    run_dir = root / output / name
    if roofer:
        roofer_dir = run_dir / "roofer_output"
        roofer_dir.mkdir(parents=True, exist_ok=True)
        (roofer_dir / "tile.city.jsonl").write_text("{}\n", encoding="utf-8")
    run_dir.mkdir(parents=True, exist_ok=True)
    if scene:
        render = run_dir / "render"
        render.mkdir(parents=True, exist_ok=True)
        (render / "scene.glb").write_bytes(b"glTF")
        (render / "scene.json").write_text("{}\n", encoding="utf-8")
    return run_dir


class LatestSceneRunTest(unittest.TestCase):
    def test_ignore_une_execution_sans_scene(self) -> None:
        """Le critère n'est pas celui de `latest_run` : une exécution Roofer complète peut
        n'avoir jamais été enrichie, et le sélecteur ne propose que ce qui se charge."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = _write_config(root, "poc", 100, "output")
            _write_run(root, "output", "run-1", scene=True)
            _write_run(root, "output", "run-2", scene=False)
            config = PocConfig.load(root, source)
            self.assertEqual(latest_scene_run(config).name, "run-1")

    def test_rend_none_sans_aucune_scene(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = _write_config(root, "poc", 100, "output")
            _write_run(root, "output", "run-1", scene=False)
            config = PocConfig.load(root, source)
            self.assertIsNone(latest_scene_run(config))


class AvailableScenesTest(unittest.TestCase):
    def test_place_l_execution_preparee_en_tete(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = _write_config(root, "poc-200m", 200, "output-200m")
            run_dir = _write_run(root, "output-200m", "run-200", scene=True)
            config = PocConfig.load(root, source)
            entries = available_scenes(config, run_dir)
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0].label, "200 × 200 m")
            # La scène courante garde le chemin historique : rien à déplacer pour le sélecteur.
            manifest = entries[0].as_manifest()
            self.assertEqual(manifest["scene"], "assets/scene.glb")
            self.assertEqual(
                manifest["configuration"]["orthophotoLayer"], "ORTHOIMAGERY.ORTHOPHOTOS"
            )
            # Marge par défaut de 15 m : l'orthophoto couvre 230 m sur 1 024 pixels.
            self.assertAlmostEqual(
                manifest["configuration"]["orthophotoResolutionM"], 230 / 1024
            )

    def test_ajoute_les_autres_emprises(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            active = _write_config(root, "poc-200m", 200, "output-200m")
            _write_config(root, "poc-600m", 600, "output-600m")
            run_dir = _write_run(root, "output-200m", "run-200", scene=True)
            _write_run(root, "output-600m", "run-600", scene=True)
            entries = available_scenes(PocConfig.load(root, active), run_dir)
            self.assertEqual([entry.label for entry in entries], ["200 × 200 m", "600 × 600 m"])
            self.assertEqual(
                entries[1].as_manifest()["scene"], "assets/scenes/poc-600m/scene.glb"
            )
            self.assertEqual(entries[1].run, "run-600")

    def test_transmet_la_resolution_orthophoto_configuree(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = _write_config(root, "poc", 100, "output")
            source.write_text(
                source.read_text(encoding="utf-8")
                + "TERRAIN_MARGIN_M=10\nORTHO_SIZE_PX=2400\n"
                + 'ORTHO_LAYER="ORTHO_TEST"\nORTHO_DATE="2025-06"\n',
                encoding="utf-8",
            )
            run_dir = _write_run(root, "output", "run-1", scene=True)
            manifest = available_scenes(PocConfig.load(root, source), run_dir)[0].as_manifest()
            configuration = manifest["configuration"]
            self.assertEqual(configuration["orthophotoLayer"], "ORTHO_TEST")
            self.assertEqual(configuration["orthophotoDate"], "2025-06")
            self.assertAlmostEqual(configuration["orthophotoResolutionM"], 0.05)

    def test_n_annonce_pas_deux_fois_la_meme_execution(self) -> None:
        """La configuration courante est aussi dans `config/` : elle ne doit pas s'ajouter."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            active = _write_config(root, "poc-600m", 600, "output-600m")
            run_dir = _write_run(root, "output-600m", "run-600", scene=True)
            entries = available_scenes(PocConfig.load(root, active), run_dir)
            self.assertEqual(len(entries), 1)

    def test_omet_une_emprise_sans_scene(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            active = _write_config(root, "poc-200m", 200, "output-200m")
            _write_config(root, "poc", 100, "output")
            run_dir = _write_run(root, "output-200m", "run-200", scene=True)
            _write_run(root, "output", "run-100", scene=False)
            entries = available_scenes(PocConfig.load(root, active), run_dir)
            self.assertEqual([entry.identifier for entry in entries], ["poc-200m"])


class ViewerInterfaceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.parser = _InterfaceParser()
        self.parser.feed((ROOT / "viewer" / "index.html").read_text(encoding="utf-8"))

    def test_expose_les_commandes_prioritaires(self) -> None:
        self.assertTrue(
            {
                "viewReset",
                "viewMairie",
                "viewRoof",
                "panelToggle",
                "controlPanel",
                "buildingDetails",
                "buildingHeight",
                "buildingArea",
                "buildingAltitude",
                "buildingQuality",
                "dataInfoDialog",
                "dataInfoContent",
            }.issubset(self.parser.ids)
        )
        self.assertEqual(self.parser.render_modes, {"ortho", "model", "quality"})

    def test_expose_les_reperes_et_la_progression(self) -> None:
        """Chargement, aide, échelle et recherche sont des éléments d'interface, pas du texte."""
        self.assertTrue(
            {
                "loadProgress",
                "helpDialog",
                "qualityLegend",
                "buildingSearch",
                "searchDegraded",
                "scaleBar",
            }.issubset(self.parser.ids)
        )

    def test_ne_cible_aucun_identifiant_absent_du_document(self) -> None:
        """Un `querySelector` sur un identifiant disparu rend `null` et casse le visualiseur
        au chargement, sans que rien ne le signale à la préparation. Le contrôle est ici."""
        script = (ROOT / "viewer" / "app.js").read_text(encoding="utf-8")
        targeted = set(re.findall(r'"#([A-Za-z][\w-]*)"', script))
        self.assertTrue(targeted, "aucun sélecteur d'identifiant lu dans app.js")
        self.assertEqual(targeted - self.parser.ids, set())

    def test_replie_les_reglages_fins_dans_le_bloc_expert(self) -> None:
        """L'invariant des deux niveaux, vérifié par la répartition et non par un décompte.

        Le mode de rendu appartient au niveau avancé : c'est un préréglage des textures, pas une
        commande de chaque ouverture. Le premier niveau garde les couches — pliables, elles sont
        cinq — et les points de vue, qui tiennent sur une ligne.
        """
        self.assertIn("expertControls", self.parser.ids)
        self.assertIn("layersControls", self.parser.ids)
        self.assertIn("renderControls", self.parser.ids)
        self.assertTrue(self.parser.render_modes_in_expert)
        self.assertGreaterEqual(self.parser.expert_accordions, 5)
        # Un seul accordéon hors du bloc avancé : les couches.
        self.assertEqual(self.parser.accordions - self.parser.expert_accordions, 1)


if __name__ == "__main__":
    unittest.main()
