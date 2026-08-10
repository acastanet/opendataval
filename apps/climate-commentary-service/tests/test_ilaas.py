from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from urllib.request import Request

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-commentary-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_commentary_service.ilaas import (  # noqa: E402
    DEFAULT_ILAAS_URL,
    DEFAULT_MODEL,
    IlaasConfig,
    IlaasError,
    create_ilaas_generator,
)


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._raw = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return self._raw


class IlaasTest(unittest.TestCase):
    def test_config_reuses_geologie_synthese_variables(self) -> None:
        config = IlaasConfig.from_env({
            "GEOLOGIE_LLM_URL": "https://llm.example/v1/chat/completions",
            "GEOLOGIE_LLM_VISION_MODEL": "modele-partage",
            "GEOLOGIE_LLM_API_KEY": "secret",
            "GEOLOGIE_LLM_VISION_TIMEOUT_MS": "12345",
            "GEOLOGIE_LLM_SYNTHESE_MAX_TOKENS": "777",
        })
        self.assertEqual(config.url, "https://llm.example/v1/chat/completions")
        self.assertEqual(config.model, "modele-partage")
        self.assertEqual(config.api_key, "secret")
        self.assertEqual(config.timeout_seconds, 12.345)
        self.assertEqual(config.max_tokens, 777)

    def test_config_defaults_match_geologie(self) -> None:
        config = IlaasConfig.from_env({})
        self.assertEqual(config.url, DEFAULT_ILAAS_URL)
        self.assertEqual(config.model, DEFAULT_MODEL)
        self.assertEqual(config.timeout_seconds, 45.0)
        self.assertEqual(config.max_tokens, 700)

    def test_generator_calls_openai_compatible_ilaas_with_temperature_zero(self) -> None:
        captured: dict = {}

        def fake_open(request: Request, timeout: float):
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            captured["authorization"] = request.get_header("Authorization")
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse({
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "summary": "Le climat récent est plus chaud.",
                            "findings": [],
                            "caveats": [],
                            "abstentions": [],
                        })
                    }
                }]
            })

        config = IlaasConfig(
            url="https://llm.ilaas.fr/v1/chat/completions",
            model="mistral-medium-latest",
            api_key="cle-test",
            timeout_seconds=45,
            max_tokens=700,
        )
        payload = create_ilaas_generator(config, open_url=fake_open)([
            {"role": "system", "content": "system"},
            {"role": "user", "content": "{}"},
        ])

        self.assertEqual(payload["summary"], "Le climat récent est plus chaud.")
        self.assertEqual(captured["url"], config.url)
        self.assertEqual(captured["timeout"], 45)
        self.assertEqual(captured["authorization"], "Bearer cle-test")
        self.assertEqual(captured["body"]["model"], "mistral-medium-latest")
        self.assertEqual(captured["body"]["temperature"], 0)
        self.assertEqual(captured["body"]["max_tokens"], 700)

    def test_missing_shared_key_disables_generation(self) -> None:
        config = IlaasConfig.from_env({})
        with self.assertRaisesRegex(IlaasError, "GEOLOGIE_LLM_API_KEY absent"):
            create_ilaas_generator(config)([{"role": "user", "content": "{}"}])

    def test_non_json_model_content_is_rejected(self) -> None:
        def fake_open(_request: Request, timeout: float):
            self.assertEqual(timeout, 45)
            return FakeResponse({"choices": [{"message": {"content": "pas du JSON"}}]})

        config = IlaasConfig(
            url=DEFAULT_ILAAS_URL,
            model=DEFAULT_MODEL,
            api_key="cle-test",
            timeout_seconds=45,
            max_tokens=700,
        )
        with self.assertRaisesRegex(IlaasError, "JSON éditorial attendu"):
            create_ilaas_generator(config, open_url=fake_open)([
                {"role": "user", "content": "{}"}
            ])


if __name__ == "__main__":
    unittest.main()
