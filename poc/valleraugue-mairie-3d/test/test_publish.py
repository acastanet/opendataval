from pathlib import Path
from tempfile import TemporaryDirectory
import json
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.publish import check_manifest, compress_tree, publish_viewer, sync_tree
from poc3d.web import VENDOR_FILES


def _write_config(root: Path, name: str, side: int, output: str, *, title: str = "") -> Path:
    source = root / "config" / f"{name}.conf"
    source.parent.mkdir(parents=True, exist_ok=True)
    text = (
        f'POC_BBOX="0 0 {side} {side}"\n'
        f"EXPECTED_WIDTH_M={side}\nEXPECTED_HEIGHT_M={side}\n"
        f'OUTPUT_DIR="./{output}"\n'
    )
    if title:
        text += f'SCENE_TITLE="{title}"\n'
    source.write_text(text, encoding="utf-8")
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
        (render / "scene.glb").write_bytes(b"glTF" * 100)
        (render / "scene.json").write_text("{}\n", encoding="utf-8")
    return run_dir


def _write_viewer(root: Path) -> None:
    viewer = root / "viewer"
    viewer.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "app.js", "styles.css", "favicon.svg"):
        (viewer / name).write_text(f"{name}\n", encoding="utf-8")


def _prewarm_vendor(run_dir: Path) -> None:
    """Dépose des dépendances Three.js factices pour que `prepare_viewer` n'aille pas les
    télécharger : les tests doivent rester valables hors ligne."""
    vendor_dir = run_dir / "web" / "vendor"
    for relative in VENDOR_FILES:
        destination = vendor_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text("// dépendance factice\n", encoding="utf-8")


class CheckManifestTest(unittest.TestCase):
    def _write(self, web_dir: Path, entries: list[dict]) -> None:
        assets = web_dir / "assets"
        assets.mkdir(parents=True, exist_ok=True)
        (assets / "scenes.json").write_text(
            json.dumps(entries, ensure_ascii=False), encoding="utf-8"
        )

    def test_accepte_un_manifeste_complet(self) -> None:
        with TemporaryDirectory() as directory:
            web_dir = Path(directory)
            (web_dir / "assets").mkdir()
            (web_dir / "assets" / "scene.glb").write_bytes(b"glTF")
            (web_dir / "assets" / "scene.json").write_text("{}", encoding="utf-8")
            self._write(
                web_dir,
                [
                    {
                        "id": "poc-200m",
                        "label": "Valleraugue · 200 m",
                        "scene": "assets/scene.glb",
                        "metadata": "assets/scene.json",
                    }
                ],
            )
            self.assertEqual(check_manifest(web_dir), [])

    def test_signale_le_manifeste_absent(self) -> None:
        with TemporaryDirectory() as directory:
            self.assertEqual(
                check_manifest(Path(directory)), ["assets/scenes.json est absent"]
            )

    def test_signale_un_fichier_reference_mais_absent(self) -> None:
        with TemporaryDirectory() as directory:
            web_dir = Path(directory)
            self._write(
                web_dir,
                [
                    {
                        "id": "poc-200m",
                        "label": "Valleraugue · 200 m",
                        "scene": "assets/scene.glb",
                        "metadata": "assets/scene.json",
                    }
                ],
            )
            problems = check_manifest(web_dir)
            self.assertTrue(any("scene" in p and "poc-200m" in p for p in problems))
            self.assertTrue(any("metadata" in p and "poc-200m" in p for p in problems))

    def test_signale_un_artefact_geologique_absent(self) -> None:
        with TemporaryDirectory() as directory:
            web_dir = Path(directory)
            (web_dir / "assets").mkdir()
            (web_dir / "assets" / "scene.glb").write_bytes(b"glTF")
            (web_dir / "assets" / "scene.json").write_text("{}", encoding="utf-8")
            self._write(
                web_dir,
                [
                    {
                        "id": "poc-200m",
                        "label": "Valleraugue · 200 m",
                        "scene": "assets/scene.glb",
                        "metadata": "assets/scene.json",
                        "configuration": {
                            "geology": {
                                "texture": "assets/geology.png",
                                "pick": "assets/geology-pick.png",
                                "metadata": "assets/geology.json",
                            }
                        },
                    }
                ],
            )
            problems = check_manifest(web_dir)
            self.assertEqual(len(problems), 3)
            self.assertTrue(all("geology" in p for p in problems))

    def test_signale_les_labels_dupliques(self) -> None:
        with TemporaryDirectory() as directory:
            web_dir = Path(directory)
            (web_dir / "assets").mkdir()
            for name in ("scene.glb", "scene.json"):
                (web_dir / "assets" / name).write_bytes(b"x")
            entries = [
                {
                    "id": identifier,
                    "label": "Valleraugue",
                    "scene": "assets/scene.glb",
                    "metadata": "assets/scene.json",
                }
                for identifier in ("poc", "poc-200m")
            ]
            self._write(web_dir, entries)
            problems = check_manifest(web_dir)
            self.assertEqual(len(problems), 1)
            self.assertIn("Valleraugue", problems[0])

    def test_signale_un_label_absent(self) -> None:
        with TemporaryDirectory() as directory:
            web_dir = Path(directory)
            (web_dir / "assets").mkdir()
            for name in ("scene.glb", "scene.json"):
                (web_dir / "assets" / name).write_bytes(b"x")
            self._write(
                web_dir,
                [{"id": "poc", "scene": "assets/scene.glb", "metadata": "assets/scene.json"}],
            )
            problems = check_manifest(web_dir)
            self.assertTrue(any("label" in p for p in problems))


class SyncTreeTest(unittest.TestCase):
    def test_copie_les_fichiers_nouveaux(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "web"
            target = root / "publication"
            (source / "assets").mkdir(parents=True)
            (source / "assets" / "scene.glb").write_bytes(b"glTF")
            copied, removed, unchanged = sync_tree(source, target)
            self.assertEqual(copied, ["assets/scene.glb"])
            self.assertEqual(removed, [])
            self.assertEqual(unchanged, 0)
            self.assertEqual((target / "assets" / "scene.glb").read_bytes(), b"glTF")

    def test_ignore_un_fichier_inchange(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "web"
            target = root / "publication"
            (source).mkdir(parents=True)
            (source / "index.html").write_text("v1", encoding="utf-8")
            sync_tree(source, target)
            copied, removed, unchanged = sync_tree(source, target)
            self.assertEqual(copied, [])
            self.assertEqual(removed, [])
            self.assertEqual(unchanged, 1)

    def test_recopie_un_fichier_modifie(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "web"
            target = root / "publication"
            source.mkdir(parents=True)
            (source / "app.js").write_text("v1", encoding="utf-8")
            sync_tree(source, target)
            time.sleep(0.01)
            (source / "app.js").write_text("version plus longue", encoding="utf-8")
            copied, _, _ = sync_tree(source, target)
            self.assertEqual(copied, ["app.js"])
            self.assertEqual(
                (target / "app.js").read_text(encoding="utf-8"), "version plus longue"
            )

    def test_supprime_les_fichiers_orphelins_et_leur_gz(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "web"
            target = root / "publication"
            (source / "assets" / "scenes" / "poc-600m").mkdir(parents=True)
            (source / "assets" / "scenes" / "poc-600m" / "scene.glb").write_bytes(b"glTF")
            sync_tree(source, target)
            self.assertTrue((target / "assets" / "scenes" / "poc-600m" / "scene.glb").is_file())
            # La scène retirée dans web/ doit disparaître de publication/, .gz et dossier compris.
            (target / "assets" / "scenes" / "poc-600m" / "scene.glb.gz").write_bytes(b"\x1f\x8b")
            import shutil as _shutil

            _shutil.rmtree(source / "assets" / "scenes" / "poc-600m")
            copied, removed, _ = sync_tree(source, target)
            self.assertEqual(copied, [])
            self.assertEqual(
                sorted(removed),
                [
                    "assets/scenes/poc-600m/scene.glb",
                    "assets/scenes/poc-600m/scene.glb.gz",
                ],
            )
            self.assertFalse((target / "assets" / "scenes" / "poc-600m").exists())

    def test_priorise_les_donnees_avant_l_interface(self) -> None:
        from poc3d.publish import _write_priority

        relatives = [
            "index.html",
            "app.js",
            "viewer-manifest.json",
            "assets/scenes.json",
            "assets/scene.glb",
            "vendor/three.module.js",
        ]
        ordered = sorted(relatives, key=_write_priority)
        self.assertEqual(
            ordered,
            [
                "assets/scene.glb",
                "vendor/three.module.js",
                "assets/scenes.json",
                "viewer-manifest.json",
                "app.js",
                "index.html",
            ],
        )


class CompressTreeTest(unittest.TestCase):
    def test_compresse_les_types_eligibles_seulement(self) -> None:
        with TemporaryDirectory() as directory:
            target = Path(directory)
            (target / "scene.glb").write_bytes(b"glTF" * 50)
            (target / "readme.txt").write_text("non compressible", encoding="utf-8")
            compressed = compress_tree(target)
            self.assertEqual(compressed, 1)
            self.assertTrue((target / "scene.glb.gz").is_file())
            self.assertFalse((target / "readme.txt.gz").exists())

    def test_ne_recompresse_pas_un_gz_a_jour(self) -> None:
        with TemporaryDirectory() as directory:
            target = Path(directory)
            (target / "scene.glb").write_bytes(b"glTF" * 50)
            self.assertEqual(compress_tree(target), 1)
            self.assertEqual(compress_tree(target), 0)

    def test_recompresse_un_gz_perime(self) -> None:
        with TemporaryDirectory() as directory:
            target = Path(directory)
            source_file = target / "scene.glb"
            source_file.write_bytes(b"glTF" * 50)
            compress_tree(target)
            time.sleep(0.01)
            source_file.write_bytes(b"glTF" * 80)
            self.assertEqual(compress_tree(target), 1)

    def test_produit_un_gz_lisible(self) -> None:
        import gzip

        with TemporaryDirectory() as directory:
            target = Path(directory)
            content = b"contenu de test" * 20
            (target / "styles.css").write_bytes(content)
            compress_tree(target)
            with gzip.open(target / "styles.css.gz", "rb") as handle:
                self.assertEqual(handle.read(), content)


class PublishViewerTest(unittest.TestCase):
    def test_publie_une_scene_complete(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            _write_viewer(root)
            source = _write_config(root, "poc-200m", 200, "output-200m", title="Valleraugue")
            run_dir = _write_run(root, "output-200m", "run-200", scene=True)
            _prewarm_vendor(run_dir)
            config = PocConfig.load(root, source)
            target = publish_viewer(config)
            self.assertTrue((target / "index.html").is_file())
            self.assertTrue((target / "assets" / "scene.glb.gz").is_file())
            scenes = json.loads((target / "assets" / "scenes.json").read_text(encoding="utf-8"))
            self.assertEqual(len(scenes), 1)
            self.assertEqual(scenes[0]["label"], "Valleraugue · 200 m")

    def test_republication_incrementale_ne_touche_a_rien(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            _write_viewer(root)
            source = _write_config(root, "poc-200m", 200, "output-200m", title="Valleraugue")
            run_dir = _write_run(root, "output-200m", "run-200", scene=True)
            _prewarm_vendor(run_dir)
            config = PocConfig.load(root, source)
            publish_viewer(config)
            target = root / "publication"
            glb_mtime_before = (target / "assets" / "scene.glb.gz").stat().st_mtime
            publish_viewer(config)
            self.assertEqual(
                (target / "assets" / "scene.glb.gz").stat().st_mtime, glb_mtime_before
            )

    def test_refuse_de_publier_des_labels_ambigus(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            _write_viewer(root)
            active = _write_config(root, "poc-200m", 200, "output-200m", title="Valleraugue")
            # Même titre, même emprise que la source active : `_scene_label` produit alors le
            # même texte pour les deux entrées, ce que le sélecteur ne peut pas distinguer.
            _write_config(root, "poc-200m-bis", 200, "output-200m-bis", title="Valleraugue")
            run_dir = _write_run(root, "output-200m", "run-200", scene=True)
            _write_run(root, "output-200m-bis", "run-200bis", scene=True)
            _prewarm_vendor(run_dir)
            config = PocConfig.load(root, active)
            with self.assertRaisesRegex(RuntimeError, "labels du sélecteur dupliqués"):
                publish_viewer(config)
            self.assertFalse((root / "publication").exists())


if __name__ == "__main__":
    unittest.main()
