from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-commentary-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_commentary_service import (  # noqa: E402
    CommentaryValidationError,
    build_commentary,
    build_prompt_payload,
    generate_commentary,
)
from climate_commentary_service.catalogue import caveat_texts, load_catalogue  # noqa: E402

FIXTURES = REPO_ROOT / "apps" / "climate-commentary-service" / "tests" / "fixtures"
CATALOGUE = REPO_ROOT / "doc" / "climat" / "signals" / "catalogue.yaml"
V4_RESULT = (
    REPO_ROOT
    / "doc"
    / "climat"
    / "validations"
    / "data"
    / "thermal-seasons-v4"
    / "thermal-seasons-v4-replay.json"
)


class CommentaryServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.results = json.loads((FIXTURES / "sheet-results.json").read_text(encoding="utf-8"))
        cls.model_payload = json.loads((FIXTURES / "sheet-model-payload.json").read_text(encoding="utf-8"))
        cls.golden = json.loads((FIXTURES / "sheet-commentary.golden.json").read_text(encoding="utf-8"))
        cls.v4_result = json.loads(V4_RESULT.read_text(encoding="utf-8"))

    def test_build_commentary_matches_golden(self) -> None:
        commentary = build_commentary(
            self.results,
            self.model_payload,
            model="test-model",
            generated_at="2026-08-10T08:00:00Z",
            commentary_id="COMMENTARY-VALIDATION",
        )
        self.assertEqual(commentary, self.golden)

    def test_prompt_applies_p9_sheet_selection_before_model(self) -> None:
        catalogue = load_catalogue(CATALOGUE)
        payload = build_prompt_payload(self.results, caveat_texts=caveat_texts(catalogue))
        self.assertEqual(payload["scope"], "sheet")
        self.assertEqual(len(payload["signals"]), 5)
        ids = {signal["id"] for signal in payload["signals"]}
        self.assertEqual(
            ids,
            {
                "overview-temp:validation",
                "overview-precip:validation",
                "fingerprint-temp:validation",
                "fingerprint-utci:validation",
                "water-soil:validation",
            },
        )
        excluded = {item["signal_id"] for item in payload["editorial_policy"]["excluded_signals"]}
        self.assertEqual(
            excluded,
            {
                "summer-start:validation",
                "autumn-start:validation",
                "summer-length:validation",
                "water-precip:validation",
                "water-dry-months:validation",
            },
        )
        self.assertTrue(all("data" not in ref for ref in payload["result_refs"]))
        self.assertIn("gridded-reanalysis", {item["id"] for item in payload["caveats"]})

    def test_prompt_allows_validated_thermal_seasons_v4(self) -> None:
        results = json.loads(json.dumps(self.results))
        results[2] = self.v4_result
        catalogue = load_catalogue(CATALOGUE)
        payload = build_prompt_payload(results, caveat_texts=caveat_texts(catalogue))

        v4_signals = [
            signal
            for signal in payload["signals"]
            if (signal.get("method") or {}).get("id") == "thermal-seasons"
        ]
        self.assertEqual(len(v4_signals), 5)
        self.assertTrue(all(signal["method"]["version"] == "4.0.0" for signal in v4_signals))
        self.assertEqual(
            {signal["definition_id"] for signal in v4_signals},
            {
                "thermal-spring-start-shift",
                "thermal-summer-start-shift",
                "thermal-autumn-start-shift",
                "thermal-winter-start-shift",
                "thermal-summer-length-change",
            },
        )
        excluded_ids = {item["signal_id"] for item in payload["editorial_policy"]["excluded_signals"]}
        self.assertTrue(all(signal["id"] not in excluded_ids for signal in v4_signals))
        self.assertIn("decadal-climatology-season-model", {item["id"] for item in payload["caveats"]})

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

    def test_generator_cannot_reintroduce_a_signal_excluded_from_prompt(self) -> None:
        stale_payload = json.loads(json.dumps(self.model_payload))
        stale_payload["findings"].append(
            {
                "id": "finding-saison-interdit",
                "text": "L'été thermique commence plus tôt.",
                "signal_ids": ["summer-start:validation"],
                "claim_level": "descriptive",
            }
        )

        with self.assertRaisesRegex(CommentaryValidationError, "exclu par P9"):
            generate_commentary(
                self.results,
                lambda _messages: stale_payload,
                model="test-model",
                generated_at="2026-08-10T08:00:00Z",
                commentary_id="COMMENTARY-P9-REJECT",
            )

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
