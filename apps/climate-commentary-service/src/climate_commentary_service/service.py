from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from uuid import uuid4

from .catalogue import caveat_texts, load_catalogue
from .prompt import PROMPT_VERSION, build_messages_from_payload, build_prompt_payload
from .validator import CommentaryValidationError, validate_commentary

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_SCHEMA_PATH = REPO_ROOT / "packages" / "climate-contracts" / "schemas" / "climate-commentary.schema.json"
DEFAULT_CATALOGUE_PATH = REPO_ROOT / "doc" / "climat" / "signals" / "catalogue.yaml"

ModelGenerator = Callable[[list[dict[str, str]]], dict[str, Any]]


def _unique_method_refs(results: list[dict[str, Any]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    refs: list[dict[str, str]] = []
    for result in results:
        method = result.get("method") or {}
        key = (str(method.get("id", "")), str(method.get("version", "")))
        if not all(key) or key in seen:
            continue
        seen.add(key)
        refs.append({"id": key[0], "version": key[1]})
    return refs


def _assert_model_uses_only_prompt_signals(
    model_payload: dict[str, Any],
    allowed_signal_ids: set[str],
) -> None:
    for section in ("findings", "caveats"):
        entries = model_payload.get(section) or []
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for signal_id in entry.get("signal_ids") or []:
                if str(signal_id) not in allowed_signal_ids:
                    raise CommentaryValidationError(
                        f"Le modèle référence un signal non fourni ou exclu par P9 : {signal_id}"
                    )


def build_commentary(
    results: Iterable[dict[str, Any]],
    model_payload: dict[str, Any],
    *,
    model: str,
    generated_at: str | None = None,
    commentary_id: str | None = None,
    schema_path: Path = DEFAULT_SCHEMA_PATH,
    catalogue_path: Path = DEFAULT_CATALOGUE_PATH,
) -> dict[str, Any]:
    result_list = list(results)
    if not result_list:
        raise ValueError("Au moins un ClimateResult est requis")

    generated_at = generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    commentary_id = commentary_id or f"COMMENTARY-{uuid4()}"

    commentary = {
        "schema_version": "1.0",
        "commentary_id": commentary_id,
        "scope": "sheet" if len(result_list) > 1 else "infographic",
        "result_ids": [str(result.get("result_id")) for result in result_list],
        "method_refs": _unique_method_refs(result_list),
        "summary": model_payload.get("summary", ""),
        "findings": model_payload.get("findings", []),
        "caveats": model_payload.get("caveats", []),
        "abstentions": model_payload.get("abstentions", []),
        "generation": {
            "generated_at": generated_at,
            "service": "climate-commentary-service",
            "model": model,
            "prompt_version": PROMPT_VERSION,
        },
        "validation": {
            "status": "valid",
            "all_findings_have_signal_evidence": True,
            "unsupported_claims": [],
        },
    }

    catalogue = load_catalogue(catalogue_path)
    validate_commentary(commentary, result_list, schema_path=schema_path, catalogue=catalogue)
    return commentary


def generate_commentary(
    results: Iterable[dict[str, Any]],
    generator: ModelGenerator,
    *,
    model: str,
    generated_at: str | None = None,
    commentary_id: str | None = None,
    schema_path: Path = DEFAULT_SCHEMA_PATH,
    catalogue_path: Path = DEFAULT_CATALOGUE_PATH,
) -> dict[str, Any]:
    result_list = list(results)
    catalogue = load_catalogue(catalogue_path)
    prompt_payload = build_prompt_payload(result_list, caveat_texts=caveat_texts(catalogue))
    messages = build_messages_from_payload(prompt_payload)
    allowed_signal_ids = {
        str(signal.get("id"))
        for signal in prompt_payload.get("signals") or []
        if isinstance(signal, dict) and signal.get("id")
    }
    model_payload = generator(messages)
    if not isinstance(model_payload, dict):
        raise TypeError("Le générateur doit retourner un objet JSON")
    _assert_model_uses_only_prompt_signals(model_payload, allowed_signal_ids)
    return build_commentary(
        result_list,
        model_payload,
        model=model,
        generated_at=generated_at,
        commentary_id=commentary_id,
        schema_path=schema_path,
        catalogue_path=catalogue_path,
    )
