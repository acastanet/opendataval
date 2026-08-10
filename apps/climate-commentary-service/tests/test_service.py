from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-commentary-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_commentary_service import build_commentary, build_prompt_payload, generate_commentary  # noqa: E402
from climate_commentary_service.catalogue import caveat_texts, load_catalogue  # noqa: E402

FIXTURES = REPO_ROOT / "apps" / "climate-commentary-service" / "tests" / "fixtures"
CATALOGUE = REPO_ROOT / "doc" / "climat" / "signals" / "catalogue.yaml"


class CommentaryServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.results = json.loads((FIXTURES / "sheet-results.json").read_text(encoding="utf-8"))
        cls.model_payload = json.loads((FIXTURES / "sheet-model-payload.json").read_text(encoding="utf-8"))
        cls.golden = json.loads((FIXTURES / "sheet-commentary.golden.json").read_text(encoding="utf-8"))

    def test_build_commentary_matches_golden(self) -> None:
        commentary = build_commentary(
            self.results,
            self.model_payload,
            model="test-model",
            generated_at="2026-08-10T08:00:00Z",
            commentary_id="COMMENTARY-VALIDATION",
        )
        self.assertEqual(commentary, self.golden)

    def test_prompt_contains_signals_but_not_scientific_data_payloads(self) -> None:
        catalogue = load_catalogue(CATALOGUE)
        payload = build_prompt_payload(self.results, caveat_texts=caveat_texts(catalogue))
        self.assertEqual(payload["scope"], "sheet")
        self.assertEqual(len(payload["signals"]), 10)
        self.assertTrue(all("data" not in ref for ref in payload["result_refs"]))
        self.assertIn("gridded-reanalysis", {item["id"] for item in payload["caveats"]})

    def test_generator_only_returns_editorial_payload(self) -> None:
        captured = {}

        def fake_generator(messages):
            captured["messages"] = messages
            return self.model_payload

        commentary = generate_commentary(
            self.results,
            fake_generator,
            model="test-model",
            generated_at="2026-08-10T08:00:00Z",
            commentary_id="COMMENTARY-VALIDATION",
        )
        self.assertEqual(commentary, self.golden)
        self.assertEqual(captured["messages"][0]["role"], "system")
        self.assertEqual(captured["messages"][1]["role"], "user")

    def test_insufficient_result_does_not_expose_its_signals_to_model(self) -> None:
        results = json.loads(json.dumps(self.results))
        results[-1]["quality"]["status"] = "insufficient"
        catalogue = load_catalogue(CATALOGUE)
        payload = build_prompt_payload(results, caveat_texts=caveat_texts(catalogue))
        ids = {signal["id"] for signal in payload["signals"]}
        self.assertNotIn("water-precip:validation", ids)
        self.assertNotIn("water-soil:validation", ids)
        self.assertNotIn("water-dry-months:validation", ids)


if __name__ == "__main__":
    unittest.main()
