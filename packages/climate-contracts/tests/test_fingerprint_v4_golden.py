from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from climate_contracts.legacy_fingerprint_v4 import (  # noqa: E402
    adapt_fingerprint_v4,
    resolve_json_pointer,
    validate_cross_document_invariants,
)

GOLDEN_DIR = ROOT / "tests" / "golden-masters" / "climate-fingerprint" / "v4"
SCHEMAS_DIR = ROOT / "schemas"


class FingerprintV4GoldenMasterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden_bytes = (GOLDEN_DIR / "poc-output.json").read_bytes()
        cls.legacy = json.loads(cls.golden_bytes.decode("utf-8"))
        cls.manifest = json.loads((GOLDEN_DIR / "manifest.json").read_text(encoding="utf-8"))
        cls.result = adapt_fingerprint_v4(
            cls.legacy,
            source_blob_sha=cls.manifest["source"]["source_blob_sha"],
            generated_at="2026-08-09T21:05:00Z",
        )

    def test_golden_master_is_exact_source_git_blob(self) -> None:
        header = f"blob {len(self.golden_bytes)}\0".encode("ascii")
        git_blob_sha = hashlib.sha1(header + self.golden_bytes).hexdigest()
        self.assertEqual(git_blob_sha, self.manifest["source"]["source_blob_sha"])

    def test_legacy_payload_is_preserved_without_numeric_rewrite(self) -> None:
        self.assertEqual(self.result["data"], self.legacy)
        self.assertTrue(self.result["provenance"]["legacy_summary_ignored_as_evidence"])

    def test_expected_poc_shape_and_values(self) -> None:
        expected = self.manifest["expected"]
        row_ids = [row["id"] for row in self.legacy["rows"]]
        self.assertEqual(row_ids, expected["row_ids"])
        self.assertEqual(len(self.legacy["events"]), expected["event_count"])

        for metric_id, expected_values in expected["comparison"].items():
            actual = self.legacy["comparison"]["metrics"][metric_id]
            for key, value in expected_values.items():
                self.assertEqual(actual[key], value)

    def test_six_contract_signals_are_generated(self) -> None:
        self.assertEqual(len(self.result["signals"]), self.manifest["expected"]["signal_count"])
        by_definition = {signal["definition_id"]: signal for signal in self.result["signals"]}

        expected = {
            "fingerprint-temperature-decadal-change": (1.12, "degC", "higher"),
            "fingerprint-utci-decadal-change": (1.62, "degC_utci", "higher"),
            "fingerprint-precipitation-decadal-change": (-5.0, "percent", "lower"),
            "fingerprint-heavy-rain-frequency-change": (-0.8, "days_per_year", "less_frequent"),
            "fingerprint-drought-frequency-change": (-0.2, "months_per_year", "stable"),
            "fingerprint-strong-wind-frequency-change": (-1.3, "days_per_year", "less_frequent"),
        }
        self.assertEqual(set(by_definition), set(expected))
        for definition_id, (value, unit, direction) in expected.items():
            signal = by_definition[definition_id]
            self.assertEqual(signal["value"], value)
            self.assertEqual(signal["unit"], unit)
            self.assertEqual(signal["direction"], direction)
            self.assertEqual(signal["claim_level"], "descriptive")

    def test_all_evidence_pointers_resolve_to_signal_value(self) -> None:
        for signal in self.result["signals"]:
            evidence = signal["evidence"]
            self.assertGreaterEqual(len(evidence), 1)
            pointer = evidence[0]["result_pointer"]
            self.assertNotEqual(pointer, "/data/summary")
            self.assertEqual(resolve_json_pointer(self.result, pointer), signal["value"])

    def test_cross_document_invariants(self) -> None:
        self.assertEqual(validate_cross_document_invariants(self.result), [])

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
