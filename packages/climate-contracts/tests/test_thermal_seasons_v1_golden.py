from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from climate_contracts.legacy_thermal_seasons_v1 import adapt_thermal_seasons_v1  # noqa: E402

GOLDEN_DIR = ROOT / "tests" / "golden-masters" / "thermal-seasons" / "v1"
SCHEMAS_DIR = ROOT / "schemas"


def resolve_json_pointer(document: Any, pointer: str) -> Any:
    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise ValueError(f"Not a JSON Pointer: {pointer}")
    current = document
    for raw_token in pointer.split("/")[1:]:
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list):
            current = current[int(token)]
        else:
            current = current[token]
    return current


class ThermalSeasonsV1GoldenMasterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads((GOLDEN_DIR / "manifest.json").read_text(encoding="utf-8"))
        cls.source_path = REPO_ROOT / cls.manifest["source"]["repository_path"]
        cls.golden_bytes = cls.source_path.read_bytes()
        cls.legacy = json.loads(cls.golden_bytes.decode("utf-8"))
        cls.result = adapt_thermal_seasons_v1(
            cls.legacy,
            source_blob_sha=cls.manifest["source"]["source_blob_sha"],
            generated_at="2026-08-09T21:20:00Z",
        )

    def test_source_fixture_is_exact_pinned_git_blob(self) -> None:
        header = f"blob {len(self.golden_bytes)}\0".encode("ascii")
        git_blob_sha = hashlib.sha1(header + self.golden_bytes).hexdigest()
        self.assertEqual(git_blob_sha, self.manifest["source"]["source_blob_sha"])

    def test_regression_fixture_values_are_frozen(self) -> None:
        expected = self.manifest["expected"]
        self.assertEqual(self.legacy["thresholds"]["t25_c"], expected["thresholds"]["t25_c"])
        self.assertEqual(self.legacy["thresholds"]["t75_c"], expected["thresholds"]["t75_c"])
        self.assertEqual(self.legacy["comparison"], expected["comparison"])
        self.assertEqual(self.legacy["quality"]["annual_ok"], expected["annual_ok"])
        self.assertEqual(self.legacy["quality"]["annual_total"], expected["annual_total"])

        for metric, value in expected["early_medians"].items():
            self.assertEqual(self.legacy["decades"]["1996-2005"][metric]["median"], value)
        for metric, value in expected["late_medians"].items():
            self.assertEqual(self.legacy["decades"]["2016-2025"][metric]["median"], value)

    def test_legacy_payload_is_preserved_without_recalculation(self) -> None:
        self.assertEqual(self.result["data"], self.legacy)
        self.assertTrue(self.result["provenance"]["legacy_regression_fixture"])
        self.assertEqual(self.result["quality"]["status"], "partial")

    def test_five_contract_signals_are_generated(self) -> None:
        self.assertEqual(len(self.result["signals"]), self.manifest["expected"]["signal_count"])
        by_definition = {signal["definition_id"]: signal for signal in self.result["signals"]}
        expected = {
            "thermal-spring-start-shift": (-1.66, "earlier", 43.77, 42.114999999999995),
            "thermal-summer-start-shift": (-17.69, "earlier", 172.26, 154.57),
            "thermal-autumn-start-shift": (15.27, "later", 262.14, 277.41499999999996),
            "thermal-winter-start-shift": (5.59, "later", 336.66, 342.25),
            "thermal-summer-length-change": (28.66, "longer", 91.81, 120.47),
        }
        self.assertEqual(set(by_definition), set(expected))

        for definition_id, (value, direction, early_value, late_value) in expected.items():
            signal = by_definition[definition_id]
            self.assertEqual(signal["value"], value)
            self.assertEqual(signal["unit"], "days")
            self.assertEqual(signal["direction"], direction)
            self.assertEqual(signal["claim_level"], "descriptive")
            self.assertEqual(signal["quality_status"], "valid")
            self.assertEqual(signal["comparison"]["early_value"], early_value)
            self.assertEqual(signal["comparison"]["late_value"], late_value)

    def test_evidence_pointers_resolve_to_frozen_comparison_values(self) -> None:
        for signal in self.result["signals"]:
            self.assertGreaterEqual(len(signal["evidence"]), 1)
            pointer = signal["evidence"][0]["result_pointer"]
            self.assertEqual(resolve_json_pointer(self.result, pointer), signal["value"])

    def test_method_snapshot_and_signal_invariants(self) -> None:
        method = self.result["method"]
        provenance = self.result["provenance"]
        self.assertEqual(provenance["method_id"], method["id"])
        self.assertEqual(provenance["method_version"], method["version"])
        self.assertEqual(provenance["snapshot_id"], self.result["snapshot_id"])
        self.assertEqual(len({signal["id"] for signal in self.result["signals"]}), 5)
        for signal in self.result["signals"]:
            self.assertEqual(signal["method"], method)

    def test_climate_signal_schema(self) -> None:
        schema = json.loads((SCHEMAS_DIR / "climate-signal.schema.json").read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema)
        for signal in self.result["signals"]:
            validator.validate(signal)

    def test_climate_result_schema(self) -> None:
        result_schema = json.loads((SCHEMAS_DIR / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((SCHEMAS_DIR / "climate-signal.schema.json").read_text(encoding="utf-8"))
        base_uri = SCHEMAS_DIR.resolve().as_uri() + "/"
        resolver = RefResolver(
            base_uri=base_uri,
            referrer=result_schema,
            store={
                "climate-signal.schema.json": signal_schema,
                base_uri + "climate-signal.schema.json": signal_schema,
            },
        )
        Draft202012Validator(result_schema, resolver=resolver).validate(self.result)


if __name__ == "__main__":
    unittest.main()
