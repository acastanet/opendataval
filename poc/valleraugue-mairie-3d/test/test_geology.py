from pathlib import Path
from tempfile import TemporaryDirectory
import io
import json
import sys
import unittest
import zipfile
from unittest.mock import patch

import numpy as np
import shapefile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.config import PocConfig
from poc3d.geology import (
    ARCHIVE_URL,
    _encoding,
    _hashed_colour,
    _normalise_department,
    create_geology,
)


# Coin sud-ouest de `terrain_bbox` pour la configuration ci-dessous : 200 m d'emprise et
# 15 m de marge donnent une fenêtre de 230 m de côté.
WEST, SOUTH = 751241.0, 6331436.0
SIDE = 230.0


def _config(root: Path, extra: str = "") -> PocConfig:
    config_file = root / "poc.conf"
    config_file.write_text(
        'POC_BBOX="751256 6331451 751456 6331651"\n'
        "EXPECTED_WIDTH_M=200\nEXPECTED_HEIGHT_M=200\n"
        "TERRAIN_MARGIN_M=15\nTERRAIN_RESOLUTION_M=1\n"
        "GEOLOGY_DEPARTMENT=\"30\"\nGEOLOGY_TEXTURE_SIZE_PX=256\n"
        f'OUTPUT_DIR="{(root / "out").as_posix()}"\n' + extra,
        encoding="utf-8",
    )
    return PocConfig.load(root, config_file)


def _run_dir(root: Path) -> Path:
    run = root / "out" / "run-1"
    (run / "roofer_output").mkdir(parents=True, exist_ok=True)
    return run


class _Response:
    """Réponse HTTP minimale : les tests ne doivent jamais sortir sur le réseau."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_: object) -> bool:
        return False

    def read(self) -> bytes:
        return self._payload


class _ArchiveBuilder:
    """Fabrique une BD Charm-50 réduite, en mémoire, au nommage officiel du BRGM."""

    def __init__(self, encoding: str = "utf8") -> None:
        self.encoding = encoding
        self.members: dict[str, dict[str, io.BytesIO]] = {}
        self.extras: dict[str, str] = {}

    def layer(self, suffix: str) -> shapefile.Writer:
        name = f"GEO050K_HARM_D030_{suffix}_2154"
        parts = {kind: io.BytesIO() for kind in ("shp", "shx", "dbf")}
        self.members[name] = parts
        return shapefile.Writer(**parts, encoding=self.encoding)

    def payload(self) -> bytes:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as bundle:
            for name, parts in self.members.items():
                for kind, content in parts.items():
                    bundle.writestr(f"GEO050K_HARM_030/{name}.{kind}", content.getvalue())
            for name, text in self.extras.items():
                bundle.writestr(f"GEO050K_HARM_030/{name}", text)
        return buffer.getvalue()


def _formations(builder: _ArchiveBuilder, *, hole: bool = False, faraway: bool = True) -> None:
    """Deux formations en bandes, l'ouest et l'est de l'emprise."""
    writer = builder.layer("S_FGEOL")
    writer.field("CODE_LEG", "N", 6)
    writer.field("NOTATION", "C", 20)
    writer.field("DESCR", "C", 120)
    for channel in ("C_FOND", "M_FOND", "J_FOND", "N_FOND"):
        writer.field(channel, "N", 4)
    middle = WEST + SIDE / 2
    writer.poly(
        [
            [
                [WEST, SOUTH],
                [middle, SOUTH],
                [middle, SOUTH + SIDE],
                [WEST, SOUTH + SIDE],
                [WEST, SOUTH],
            ]
        ]
    )
    writer.record(355, "b3", 'Schistes sériciteux des ""Cévennes"" (Cambrien)', 75, 25, 50, 0)
    east = [
        [
            [middle, SOUTH],
            [WEST + SIDE, SOUTH],
            [WEST + SIDE, SOUTH + SIDE],
            [middle, SOUTH + SIDE],
            [middle, SOUTH],
        ]
    ]
    if hole:
        east.append(
            [
                [middle + 40, SOUTH + 90],
                [middle + 40, SOUTH + 140],
                [middle + 90, SOUTH + 140],
                [middle + 90, SOUTH + 90],
                [middle + 40, SOUTH + 90],
            ]
        )
    writer.poly(east)
    writer.record(410, "j1", "Calcaires bathoniens (Jurassique)", 0, 0, 0, 0)
    if faraway:
        # Formation du même département, mais à dix kilomètres : elle ne doit apparaître ni
        # dans la texture ni dans la légende.
        writer.poly(
            [
                [
                    [WEST + 10000, SOUTH],
                    [WEST + 10200, SOUTH],
                    [WEST + 10200, SOUTH + 200],
                    [WEST + 10000, SOUTH],
                ]
            ]
        )
        writer.record(900, "z9", "Hors emprise (Trias)", 10, 10, 10, 0)
    writer.close()


def _build(**kwargs: object) -> bytes:
    builder = _ArchiveBuilder(encoding=str(kwargs.pop("encoding", "utf8")))
    _formations(builder, **kwargs)  # type: ignore[arg-type]
    return builder.payload()


def _create(config: PocConfig, run: Path, payload: bytes) -> Path:
    with patch(
        "poc3d.geology.urllib.request.urlopen", return_value=_Response(payload)
    ) as mocked:
        result = create_geology(config, run)
    _create.last_url = mocked.call_args.args[0].full_url if mocked.call_args else ""
    assert result is not None
    return result


def _metadata(render_dir: Path) -> dict:
    return json.loads((render_dir / "geology.json").read_text(encoding="utf-8"))


def _identifiers(render_dir: Path) -> np.ndarray:
    pixels = np.asarray(Image.open(render_dir / "geology-pick.png")).astype(np.uint32)
    return (pixels[:, :, 0] << 16) | (pixels[:, :, 1] << 8) | pixels[:, :, 2]


class DepartmentTest(unittest.TestCase):
    def test_complete_le_numero_sur_trois_chiffres(self) -> None:
        """Le BRGM nomme ses archives sur trois chiffres : « 30 » ne trouverait rien."""
        self.assertEqual(_normalise_department("30"), "030")
        self.assertEqual(_normalise_department("048"), "048")
        self.assertEqual(_normalise_department("2a"), "2A")

    def test_refuse_un_departement_absent_ou_invalide(self) -> None:
        with self.assertRaises(ValueError):
            _normalise_department("")
        with self.assertRaises(ValueError):
            _normalise_department("Gard")


class PaletteTest(unittest.TestCase):
    def test_la_couleur_de_repli_est_stable_et_lisible(self) -> None:
        """Deux exécutions doivent teinter une formation de la même façon, sans quoi la
        légende changerait de couleur d'un run à l'autre."""
        self.assertEqual(_hashed_colour("b3"), _hashed_colour("b3"))
        self.assertNotEqual(_hashed_colour("b3"), _hashed_colour("j1"))
        for channel in _hashed_colour("b3"):
            self.assertGreater(channel, 60, "une teinte sombre passerait mal sous l'ortho")


class EncodingTest(unittest.TestCase):
    def test_reconnait_un_dbf_utf8_sans_fichier_cpg(self) -> None:
        """Les livraisons BRGM omettent souvent le `.cpg` : lu en cp1252, « sériciteux »
        ressortirait mutilé sans que rien ne le signale."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "couche.dbf").write_bytes("Schistes sériciteux".encode("utf-8"))
            self.assertEqual(_encoding(root / "couche.shp"), "utf-8")
            (root / "couche.dbf").write_bytes("Schistes sériciteux".encode("cp1252"))
            self.assertEqual(_encoding(root / "couche.shp"), "cp1252")

    def test_le_fichier_cpg_prime_sur_la_sonde(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "couche.dbf").write_bytes("Schistes sériciteux".encode("cp1252"))
            (root / "couche.cpg").write_text("UTF-8", encoding="ascii")
            self.assertEqual(_encoding(root / "couche.shp"), "utf-8")


class GeologyTest(unittest.TestCase):
    def test_produit_les_trois_artefacts_et_leur_legende(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            for name in ("geology.png", "geology-pick.png", "geology.json"):
                self.assertTrue((render / name).is_file(), name)
            metadata = _metadata(render)
            self.assertEqual(metadata["crs"], "EPSG:2154")
            self.assertEqual(metadata["scale"], 50000)
            self.assertEqual(metadata["department"], "030")
            self.assertEqual(
                metadata["archiveUrl"], ARCHIVE_URL.format(department="030")
            )
            self.assertTrue(metadata["sha256"])
            self.assertEqual([entry["code"] for entry in metadata["formations"]], ["b3", "j1"])

    def test_demande_l_archive_du_departement_configure(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            _create(_config(root, 'GEOLOGY_DEPARTMENT="48"\n'), _run_dir(root), _build())
            self.assertEqual(_create.last_url, ARCHIVE_URL.format(department="048"))

    def test_ecarte_les_formations_hors_de_l_emprise(self) -> None:
        """La légende ne doit nommer que ce qui se voit : une archive départementale porte
        des centaines de formations dont l'emprise n'en montre qu'une poignée."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            codes = [entry["code"] for entry in _metadata(render)["formations"]]
            self.assertNotIn("z9", codes)

    def test_conserve_les_trous_des_polygones(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build(hole=True))
            identifiers = _identifiers(render)
            # Le trou est au centre de la bande est, à 65 m du bord est et 115 m du sud.
            self.assertEqual(identifiers[int(256 * 0.5), int(256 * 0.78)], 0)
            self.assertEqual(identifiers[int(256 * 0.5), int(256 * 0.6)], 2)

    def test_oriente_la_texture_le_nord_en_haut(self) -> None:
        """La ligne 0 est au nord, comme toutes les grilles du POC : c'est ce qui rend les
        UV de l'orthophoto réutilisables tels quels pour draper la géologie."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            builder = _ArchiveBuilder()
            writer = builder.layer("S_FGEOL")
            writer.field("NOTATION", "C", 20)
            writer.poly(
                [
                    [
                        [WEST, SOUTH + SIDE - 20],
                        [WEST + SIDE, SOUTH + SIDE - 20],
                        [WEST + SIDE, SOUTH + SIDE],
                        [WEST, SOUTH + SIDE],
                        [WEST, SOUTH + SIDE - 20],
                    ]
                ]
            )
            writer.record("nord")
            writer.close()
            render = _create(_config(root), _run_dir(root), builder.payload())
            identifiers = _identifiers(render)
            self.assertTrue((identifiers[0] == 1).all(), "la bande nord doit occuper la ligne 0")
            self.assertFalse(identifiers[-1].any(), "la ligne sud doit rester vide")

    def test_la_carte_d_identifiants_designe_la_bonne_formation(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            identifiers = _identifiers(render)
            legend = {entry["id"]: entry["code"] for entry in _metadata(render)["formations"]}
            self.assertEqual(legend[int(identifiers[128, 10])], "b3")
            self.assertEqual(legend[int(identifiers[128, 245])], "j1")

    def test_la_texture_porte_les_couleurs_de_la_legende(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            texture = np.asarray(Image.open(render / "geology.png").convert("RGBA"))
            entry = _metadata(render)["formations"][0]
            expected = tuple(int(entry["color"][index : index + 2], 16) for index in (1, 3, 5))
            self.assertEqual(tuple(texture[128, 10][:3]), expected)
            self.assertEqual(texture[128, 10][3], 255)

    def test_reprend_la_couleur_imprimee_de_la_carte(self) -> None:
        """La BD Charm-50 porte sa symbologie dans le DBF, en quadrichromie : c'est elle qui
        donne le vert-bleu conventionnel des métamorphiques, et non le `.qml` livré à côté,
        dont les règles renvoient à des motifs qu'un navigateur ne sait pas rendre."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            metadata = _metadata(render)
            self.assertEqual(metadata["palette"], "mixte")
            colours = {entry["code"]: entry["color"] for entry in metadata["formations"]}
            # C=75 M=25 J=50 N=0 → 25 %, 75 % et 50 % de chaque canal.
            self.assertEqual(colours["b3"], "#40bf80")

    def test_retombe_sur_la_palette_derivee_sans_fond_imprime(self) -> None:
        """Une formation sans fond quadrichromique n'est pas blanche sur la carte : elle y
        est distinguée par une surcharge, que le drapage ne saurait pas rendre. Une nappe
        blanche masquerait l'orthophoto sans rien apprendre."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            colours = {
                entry["code"]: entry["color"] for entry in _metadata(render)["formations"]
            }
            self.assertNotEqual(colours["j1"], "#ffffff")
            self.assertEqual(colours["j1"], "#%02x%02x%02x" % _hashed_colour("j1"))

    def test_separe_l_age_de_la_notice(self) -> None:
        """Le format n'a pas de champ d'âge : quatre notices sur cinq le portent entre
        parenthèses en fin de description."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            entry = next(
                item for item in _metadata(render)["formations"] if item["code"] == "b3"
            )
            self.assertEqual(entry["age"], "Cambrien")
            self.assertNotIn("(", entry["label"])

    def test_nettoie_l_echappement_du_dbf(self) -> None:
        """Le DBF échappe ses guillemets à la mode CSV : les laisser afficherait cette
        mécanique dans la légende."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            render = _create(_config(root), _run_dir(root), _build())
            entry = next(
                item for item in _metadata(render)["formations"] if item["code"] == "b3"
            )
            self.assertNotIn('""', entry["label"])
            self.assertEqual(entry["label"], "Schistes sériciteux des «Cévennes»")

    def test_produit_deux_fois_les_memes_octets(self) -> None:
        """Sans ordre stable, deux exécutions sur la même archive donneraient des PNG
        différents, et le dépôt verrait bouger des artefacts identiques."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            payload = _build()
            first = _create(_config(root), _run_dir(root), payload)
            reference = (first / "geology.png").read_bytes()
            picking = (first / "geology-pick.png").read_bytes()
            second = _create(_config(root), _run_dir(root), payload)
            self.assertEqual(reference, (second / "geology.png").read_bytes())
            self.assertEqual(picking, (second / "geology-pick.png").read_bytes())

    def test_reutilise_l_archive_du_cache(self) -> None:
        """Deux emprises d'un même département ne doivent télécharger l'archive qu'une
        fois : elle pèse une vingtaine de mégaoctets."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            payload = _build()
            _create(_config(root), _run_dir(root), payload)
            with patch("poc3d.geology.urllib.request.urlopen") as mocked:
                create_geology(_config(root), _run_dir(root))
            mocked.assert_not_called()

    def test_retelecharge_une_archive_tronquee(self) -> None:
        """Une archive interrompue passerait le test « présent et non vide » mais échouerait
        à la lecture d'un membre, très loin de la cause."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            payload = _build()
            _create(_config(root), _run_dir(root), payload)
            cached = root / ".work" / "geology" / "GEO050K_HARM_030.zip"
            cached.write_bytes(payload[: len(payload) // 2])
            with patch(
                "poc3d.geology.urllib.request.urlopen", return_value=_Response(payload)
            ) as mocked:
                create_geology(_config(root), _run_dir(root))
            mocked.assert_called_once()

    def test_signale_une_reponse_qui_n_est_pas_une_archive(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with patch(
                "poc3d.geology.urllib.request.urlopen",
                return_value=_Response(b"<html>Service indisponible</html>"),
            ):
                with self.assertRaises(RuntimeError):
                    create_geology(_config(root), _run_dir(root))

    def test_propage_une_panne_reseau(self) -> None:
        """L'appelant enveloppe cette erreur : la scène se produit sans la couche."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with patch(
                "poc3d.geology.urllib.request.urlopen", side_effect=OSError("hors ligne")
            ):
                with self.assertRaises(OSError):
                    create_geology(_config(root), _run_dir(root))

    def test_refuse_une_archive_sans_couche_de_formations(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            builder = _ArchiveBuilder()
            writer = builder.layer("L_STRUCT")
            writer.field("TYPE", "C", 20)
            writer.line([[[WEST, SOUTH], [WEST + SIDE, SOUTH + SIDE]]])
            writer.record("faille")
            writer.close()
            with patch(
                "poc3d.geology.urllib.request.urlopen",
                return_value=_Response(builder.payload()),
            ):
                with self.assertRaises(RuntimeError):
                    create_geology(_config(root), _run_dir(root))

    def test_refuse_une_projection_inattendue(self) -> None:
        """Un shapefile en WGS84 se lirait sans erreur et produirait une texture vide."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            builder = _ArchiveBuilder()
            writer = builder.layer("S_FGEOL")
            writer.field("NOTATION", "C", 20)
            writer.poly([[[3.64, 44.08], [3.65, 44.08], [3.65, 44.09], [3.64, 44.08]]])
            writer.record("b3")
            writer.close()
            with patch(
                "poc3d.geology.urllib.request.urlopen",
                return_value=_Response(builder.payload()),
            ):
                with self.assertRaisesRegex(ValueError, "projection"):
                    create_geology(_config(root), _run_dir(root))

    def test_refuse_un_departement_ne_couvrant_pas_la_scene(self) -> None:
        """Se tromper de département donnerait sinon une carte vide sans explication."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            builder = _ArchiveBuilder()
            _formations(builder)
            payload = builder.payload()
            config = _config(root, 'POC_BBOX="200000 6600000 200200 6600200"\n')
            with patch(
                "poc3d.geology.urllib.request.urlopen", return_value=_Response(payload)
            ):
                with self.assertRaisesRegex(ValueError, "couvre"):
                    create_geology(config, _run_dir(root))

    def test_ne_produit_rien_quand_la_scene_desactive_la_couche(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            run = _run_dir(root)
            with patch("poc3d.geology.urllib.request.urlopen") as mocked:
                self.assertIsNone(create_geology(_config(root, "GEOLOGY=0\n"), run))
            mocked.assert_not_called()
            self.assertFalse((run / "render" / "geology.png").exists())

    def test_refuse_une_texture_hors_bornes(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            config = _config(root, "GEOLOGY_TEXTURE_SIZE_PX=64\n")
            with self.assertRaises(ValueError):
                create_geology(config, _run_dir(root))


if __name__ == "__main__":
    unittest.main()
