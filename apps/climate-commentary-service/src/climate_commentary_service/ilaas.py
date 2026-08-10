from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_ILAAS_URL = "https://llm.ilaas.fr/v1/chat/completions"
DEFAULT_MODEL = "mistral-medium-latest"


class IlaasError(RuntimeError):
    pass


@dataclass(frozen=True)
class IlaasConfig:
    url: str
    model: str
    api_key: str
    timeout_seconds: float
    max_tokens: int

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "IlaasConfig":
        values = os.environ if env is None else env

        timeout_ms = _positive_integer(
            values.get("GEOLOGIE_LLM_VISION_TIMEOUT_MS"),
            45_000,
            "GEOLOGIE_LLM_VISION_TIMEOUT_MS",
        )
        max_tokens = _positive_integer(
            values.get("GEOLOGIE_LLM_SYNTHESE_MAX_TOKENS"),
            700,
            "GEOLOGIE_LLM_SYNTHESE_MAX_TOKENS",
        )
        return cls(
            url=(values.get("GEOLOGIE_LLM_URL") or DEFAULT_ILAAS_URL).strip().rstrip("/"),
            model=(values.get("GEOLOGIE_LLM_VISION_MODEL") or DEFAULT_MODEL).strip(),
            api_key=(values.get("GEOLOGIE_LLM_API_KEY") or "").strip(),
            timeout_seconds=timeout_ms / 1000,
            max_tokens=max_tokens,
        )


def _positive_integer(value: str | None, fallback: int, name: str) -> int:
    if value is None or not value.strip():
        return fallback
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} doit être un entier strictement positif") from exc
    if parsed <= 0:
        raise ValueError(f"{name} doit être un entier strictement positif")
    return parsed


def _extract_content(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise IlaasError("Réponse ILAAS invalide : objet JSON attendu")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise IlaasError("Réponse ILAAS invalide : choices absent")
    first = choices[0]
    if not isinstance(first, dict):
        raise IlaasError("Réponse ILAAS invalide : choice illisible")
    message = first.get("message")
    if not isinstance(message, dict):
        raise IlaasError("Réponse ILAAS invalide : message absent")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise IlaasError("Réponse ILAAS invalide : contenu vide")
    return content.strip()


def _parse_editorial_json(content: str) -> dict[str, Any]:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise IlaasError("Le modèle ILAAS n'a pas retourné le JSON éditorial attendu") from exc
    if not isinstance(payload, dict):
        raise IlaasError("Le JSON éditorial ILAAS doit être un objet")
    return payload


OpenUrl = Callable[..., Any]


def create_ilaas_generator(
    config: IlaasConfig,
    *,
    open_url: OpenUrl = urlopen,
) -> Callable[[list[dict[str, str]]], dict[str, Any]]:
    """Construit le générateur injecté dans climate-commentary-service.

    Les paramètres réseau et le modèle sont exactement ceux de la synthèse
    géologique BRGM : ILAAS, mistral-medium-latest par défaut, température 0.
    """

    def generate(messages: list[dict[str, str]]) -> dict[str, Any]:
        if not config.api_key:
            raise IlaasError(
                "GEOLOGIE_LLM_API_KEY absent : commentaire climat IA non généré"
            )

        request = Request(
            config.url,
            data=json.dumps(
                {
                    "model": config.model,
                    "temperature": 0,
                    "max_tokens": config.max_tokens,
                    "messages": messages,
                },
                ensure_ascii=False,
            ).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "authorization": f"Bearer {config.api_key}",
            },
            method="POST",
        )

        try:
            with open_url(request, timeout=config.timeout_seconds) as response:
                raw = response.read()
        except HTTPError as exc:
            raise IlaasError(f"ILAAS HTTP {exc.code}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise IlaasError("ILAAS indisponible") from exc

        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise IlaasError("Réponse ILAAS non JSON") from exc

        return _parse_editorial_json(_extract_content(payload))

    return generate
