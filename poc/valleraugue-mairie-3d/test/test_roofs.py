from pathlib import Path
from tempfile import TemporaryDirectory
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.roofs import MISSING_ROOF_TYPE, is_degraded, read_roof_quality, roof_type
from poc3d.validation import _roof_quality_section


def _write(path: Path, roof_types: list[str | None]) -> Path:
    header = {"type": "CityJSON", "transform": {"scale": [1, 1, 1], "translate": [0, 0, 0]}}
    lines = [json.dumps(header)]
    for index, label in enumerate(roof_types):
        attributes: dict[str, object] = {"cleabs": f"BATIMENT{index:04d}"}
        if label is not None:
            attributes["rf_roof_type"] = label
        lines.append(
            json.dumps(
                {
                    "id": f"BATIMENT{index:04d}",
                    "CityObjects": {
                        f"BATIMENT{index:04d}": {"type": "Building", "attributes": attributes},
                        # La géométrie vit dans le BuildingPart, sans attribut : le décompte
                        # doit se faire sur le feature, pas sur chaque CityObject.
                        f"BATIMENT{index:04d}-0": {"type": "BuildingPart", "attributes": {}},
                    },
                }
            )
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


class RoofTypeTest(unittest.TestCase):
    def test_reconnait_une_toiture_exploitable(self) -> None:
        self.assertFalse(is_degraded({"rf_roof_type": "slanted"}))
        self.assertFalse(is_degraded({"rf_roof_type": "horizontal"}))

    def test_signale_les_echecs_declares_par_roofer(self) -> None:
        for label in ("unknown", "no planes", "no points"):
            self.assertTrue(is_degraded({"rf_roof_type": label}), label)

    def test_traite_un_attribut_absent_comme_degrade(self) -> None:
        """Sans verdict de Roofer, rien ne distingue une toiture inventée d'une toiture mesurée."""
        self.assertEqual(roof_type({}), MISSING_ROOF_TYPE)
        self.assertTrue(is_degraded({}))
        self.assertTrue(is_degraded({"rf_roof_type": ""}))


class RoofQualityTest(unittest.TestCase):
    def test_compte_les_types_et_nomme_les_cas_degrades(self) -> None:
        with TemporaryDirectory() as directory:
            path = _write(
                Path(directory) / "a.city.jsonl",
                ["slanted", "slanted", "unknown", "no points", None],
            )
            quality = read_roof_quality([path])
            self.assertEqual(quality.total, 5)
            self.assertEqual(quality.counts["slanted"], 2)
            self.assertEqual(quality.counts[MISSING_ROOF_TYPE], 1)
            self.assertEqual(
                quality.degraded, ["BATIMENT0002", "BATIMENT0003", "BATIMENT0004"]
            )
            self.assertAlmostEqual(quality.ratio, 0.6)

    def test_ne_signale_rien_sur_une_sortie_saine(self) -> None:
        with TemporaryDirectory() as directory:
            path = _write(Path(directory) / "a.city.jsonl", ["slanted"] * 4)
            quality = read_roof_quality([path])
            self.assertEqual(quality.degraded, [])
            self.assertEqual(quality.ratio, 0.0)

    def test_tolere_un_fichier_vide(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "vide.city.jsonl"
            path.write_text("", encoding="utf-8")
            self.assertEqual(read_roof_quality([path]).total, 0)


class RoofQualitySectionTest(unittest.TestCase):
    def test_ecrit_le_decompte_et_les_identifiants_dans_le_rapport(self) -> None:
        with TemporaryDirectory() as directory:
            path = _write(Path(directory) / "a.city.jsonl", ["slanted", "no points"])
            report = "\n".join(_roof_quality_section([path]))
            self.assertIn("| `no points` | 1 |", report)
            self.assertIn("BATIMENT0001", report)
            self.assertIn("1 bâtiment(s) dégradé(s) sur 2", report)
            # Un taux au-delà du seuil doit déclencher une réserve explicite.
            self.assertIn("**Avis**", report)

    def test_reste_muet_sur_une_sortie_sans_batiment(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "vide.city.jsonl"
            path.write_text("", encoding="utf-8")
            self.assertIn("Aucun bâtiment", "\n".join(_roof_quality_section([path])))


if __name__ == "__main__":
    unittest.main()
