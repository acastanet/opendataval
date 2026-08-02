from pathlib import Path
from tempfile import TemporaryDirectory
import os
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.studio import (
    NEVER_ASSEMBLED,
    NO_RUN,
    READY,
    STALE,
    UNREADABLE,
    run_menu,
    scene_status,
    scene_statuses,
    stale_scenes,
    warn_if_stale,
)


class SceneFixture(unittest.TestCase):
    """Gabarit de dépôt : une configuration versionnée et, au choix, ce qu'elle a produit."""

    def _scene(
        self,
        root: Path,
        identifier: str,
        *,
        run: bool = False,
        assembled: bool = False,
        title: str = "Essai",
    ) -> Path:
        (root / "config").mkdir(exist_ok=True)
        source = root / "config" / f"{identifier}.conf"
        source.write_text(
            f'SCENE_TITLE="{title}"\n'
            'POC_BBOX="700000 6600000 700200 6600200"\n'
            f'OUTPUT_DIR="./output-{identifier}"\n',
            encoding="utf-8",
        )
        if run:
            run_dir = root / f"output-{identifier}" / "run-20260101-000000"
            (run_dir / "render").mkdir(parents=True)
            if assembled:
                (run_dir / "render" / "scene.glb").write_bytes(b"glb")
                (run_dir / "render" / "scene.json").write_text("{}", encoding="utf-8")
        return source


class SceneStatusTest(SceneFixture):
    """L'état d'une scène décide de ce qu'il reste à en faire : il doit être exact."""

    def test_sans_execution_amont(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = self._scene(root, "vide")
            self.assertEqual(scene_status(root, source).state, NO_RUN)

    def test_execution_jamais_enrichie(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = self._scene(root, "brute", run=True)
            self.assertEqual(scene_status(root, source).state, NEVER_ASSEMBLED)

    def test_scene_a_jour(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = self._scene(root, "prete", run=True, assembled=True)
            status = scene_status(root, source)
            self.assertEqual(status.state, READY)
            self.assertIsNotNone(status.assembled_at)
            self.assertFalse(status.needs_assembly)

    def test_configuration_retouchee_apres_l_assemblage(self) -> None:
        """Le cas qui motive tout : le calage est cuit dans le GLB, pas relu du `.conf`."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = self._scene(root, "retouchee", run=True, assembled=True)
            glb = root / "output-retouchee" / "run-20260101-000000" / "render" / "scene.glb"
            # Le GLB est daté d'avant la retouche : c'est la seule chose qui distingue les
            # deux états, et une horloge à la seconde ne suffirait pas à les séparer.
            past = time.time() - 60
            os.utime(glb, (past, past))
            status = scene_status(root, source)
            self.assertEqual(status.state, STALE)
            self.assertTrue(status.needs_assembly)

    def test_configuration_illisible_reste_listee(self) -> None:
        """Une scène cassée doit apparaître dans le menu, pas le faire échouer."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "config").mkdir()
            source = root / "config" / "cassee.conf"
            source.write_text('POC_BBOX="deux valeurs seulement"\n', encoding="utf-8")
            self.assertEqual(scene_status(root, source).state, UNREADABLE)

    def test_le_libelle_porte_le_titre_et_l_emprise(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = self._scene(root, "titree", run=True, assembled=True, title="Valleraugue")
            self.assertEqual(scene_status(root, source).label, "Valleraugue · 200 m")


class StaleReportTest(SceneFixture):
    def test_recense_les_scenes_a_reprendre(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self._scene(root, "a-jour", run=True, assembled=True)
            self._scene(root, "perimee", run=True, assembled=True)
            glb = root / "output-perimee" / "run-20260101-000000" / "render" / "scene.glb"
            past = time.time() - 60
            os.utime(glb, (past, past))
            self.assertEqual(len(scene_statuses(root)), 2)
            self.assertEqual([status.identifier for status in stale_scenes(root)], ["perimee"])

    def test_l_avertissement_nomme_la_commande_a_lancer(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self._scene(root, "perimee", run=True, assembled=True)
            glb = root / "output-perimee" / "run-20260101-000000" / "render" / "scene.glb"
            past = time.time() - 60
            os.utime(glb, (past, past))
            lines: list[str] = []
            warn_if_stale(root, printer=lines.append)
            self.assertTrue(any("perimee.conf" in line and "glb" in line for line in lines))

    def test_rien_a_signaler_n_ecrit_rien(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self._scene(root, "a-jour", run=True, assembled=True)
            lines: list[str] = []
            self.assertEqual(warn_if_stale(root, printer=lines.append), [])
            self.assertEqual(lines, [])


class MenuTest(SceneFixture):
    """Le menu doit rendre la main proprement, y compris sans terminal."""

    def _config(self, root: Path) -> PocConfig:
        source = self._scene(root, "menu", run=True, assembled=True)
        return PocConfig.load(root, source)

    def test_quitte_sur_demande(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(root)
            lines: list[str] = []
            run_menu(config, printer=lines.append, reader=lambda _: "q")
            self.assertTrue(any("Essai · 200 m" in line for line in lines))

    def test_quitte_sur_entree_fermee(self) -> None:
        """Lancé sans terminal — tube vide, tâche planifiée — le menu ne doit pas boucler."""

        def closed(_: str) -> str:
            raise EOFError

        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(root)
            run_menu(config, printer=lambda _: None, reader=closed)

    def test_signale_une_entree_non_reconnue(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = self._config(root)
            answers = iter(["42", "zzz", "q"])
            lines: list[str] = []
            run_menu(config, printer=lines.append, reader=lambda _: next(answers))
            self.assertEqual(sum("non reconnue" in line for line in lines), 2)


if __name__ == "__main__":
    unittest.main()
