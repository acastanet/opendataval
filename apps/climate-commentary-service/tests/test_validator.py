from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-commentary-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_commentary_service import CommentaryValidationError, build_commentary  # noqa: E402

FIXTURES = REPO_ROOT / "apps" / "climate-commentary-service" / "tests" / "fixtures"


class CommentaryValidatorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.results = json.loads((FIXTURES / "sheet-results.json").read_text(encoding="utf-8"))
        cls.payload = json.loads((FIXTURES / "sheet-model-payload.json").read_text(encoding="utf-8"))

    def build(self, payload, results=None):
        return build_commentary(
            results or self.results,
            payload,
            model="test-model",
            generated_at="2026-08-10T08:00:00Z",
            commentary_id="COMMENTARY-VALIDATION",
        )

    def test_unknown_signal_is_rejected(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["findings"][0]["signal_ids"] = ["unknown-signal"]
        with self.assertRaisesRegex(CommentaryValidationError, "Signal inconnu"):
            self.build(payload)

    def test_claim_level_cannot_exceed_signal(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["findings"][1]["claim_level"] = "statistical_trend"
        with self.assertRaisesRegex(CommentaryValidationError, "supérieur au signal"):
            self.build(payload)

    def test_invented_number_is_rejected(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["findings"][1]["text"] += " Le changement atteint 42 °C."
        with self.assertRaisesRegex(CommentaryValidationError, "Chiffre non ancré"):
            self.build(payload)

    def test_summary_cannot_introduce_number(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["summary"] = "Le climat change selon 4 dimensions."
        with self.assertRaisesRegex(CommentaryValidationError, "résumé transversal"):
            self.build(payload)

    def test_broken_evidence_pointer_is_rejected(self) -> None:
        results = copy.deepcopy(self.results)
        results[1]["signals"][0]["evidence"][0]["result_pointer"] = "/data/comparison/absent"
        with self.assertRaisesRegex(CommentaryValidationError, "JSON Pointer introuvable"):
            self.build(self.payload, results)

    def test_uncatalogued_caveat_is_rejected(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["caveats"][0]["id"] = "invented-caveat"
        with self.assertRaisesRegex(CommentaryValidationError, "Caveat non justifié"):
            self.build(payload)


if __name__ == "__main__":
    unittest.main()
