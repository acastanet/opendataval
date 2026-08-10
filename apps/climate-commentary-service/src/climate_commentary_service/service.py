from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from uuid import uuid4

from .catalogue import caveat_texts, load_catalogue
from .prompt import PROMPT_VERSION, build_messages
from .validator import validate_commentary

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
    messages = build_messages(result_list, caveat_texts=caveat_texts(catalogue))
    model_payload = generator(messages)
    if not isinstance(model_payload, dict):
        raise TypeError("Le générateur doit retourner un objet JSON")
    return build_commentary(
        result_list,
        model_payload,
        model=model,
        generated_at=generated_at,
        commentary_id=commentary_id,
        schema_path=schema_path,
        catalogue_path=catalogue_path,
    )
