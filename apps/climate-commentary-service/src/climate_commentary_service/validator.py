from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any, Iterable

from jsonschema import Draft202012Validator

from .catalogue import signal_definition

CLAIM_RANK = {
    "descriptive": 0,
    "statistical_trend": 1,
    "causal_attribution": 2,
}
NUMBER_RE = re.compile(r"(?<![A-Za-z0-9_-])[-+−]?\d+(?:[.,]\d+)?(?![A-Za-z0-9_])")


class CommentaryValidationError(ValueError):
    pass


def _resolve_pointer(document: Any, pointer: str) -> Any:
    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise CommentaryValidationError(f"JSON Pointer invalide : {pointer}")
    current = document
    for raw_part in pointer[1:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError) as exc:
                raise CommentaryValidationError(f"JSON Pointer introuvable : {pointer}") from exc
        elif isinstance(current, dict) and part in current:
            current = current[part]
        else:
            raise CommentaryValidationError(f"JSON Pointer introuvable : {pointer}")
    return current


def _collect_numeric_values(value: Any) -> list[float]:
    found: list[float] = []
    if isinstance(value, bool) or value is None:
        return found
    if isinstance(value, (int, float)):
        if math.isfinite(float(value)):
            found.append(float(value))
        return found
    if isinstance(value, str):
        for token in NUMBER_RE.findall(value):
            try:
                found.append(float(token.replace("−", "-").replace(",", ".")))
            except ValueError:
                continue
        return found
    if isinstance(value, dict):
        for item in value.values():
            found.extend(_collect_numeric_values(item))
        return found
    if isinstance(value, list):
        for item in value:
            found.extend(_collect_numeric_values(item))
    return found


def _allowed_number_variants(signals: Iterable[dict[str, Any]]) -> set[float]:
    values: list[float] = []
    for signal in signals:
        values.extend(_collect_numeric_values(signal.get("value")))
        values.extend(_collect_numeric_values(signal.get("comparison")))
    allowed: set[float] = set()
    for value in values:
        for candidate in (value, abs(value)):
            allowed.add(round(candidate, 6))
            allowed.add(round(candidate, 2))
            allowed.add(round(candidate, 1))
            allowed.add(float(round(candidate)))
    return allowed


def _validate_finding_numbers(text: str, signals: list[dict[str, Any]]) -> None:
    allowed = _allowed_number_variants(signals)
    for token in NUMBER_RE.findall(text):
        number = float(token.replace("−", "-").replace(",", "."))
        if round(number, 6) not in allowed and round(abs(number), 6) not in allowed:
            raise CommentaryValidationError(
                f"Chiffre non ancré dans les signaux référencés : {token!r} dans {text!r}"
            )


def _validate_signal_against_catalogue(signal: dict[str, Any], catalogue: dict[str, Any]) -> None:
    definition_id = str(signal.get("definition_id", ""))
    definition = signal_definition(catalogue, definition_id)
    method = signal.get("method") or {}
    expected_method = f"{method.get('id')}@{method.get('version')}"
    if definition.get("method") != expected_method:
        raise CommentaryValidationError(
            f"Méthode incohérente pour {definition_id}: {expected_method}"
        )
    if definition.get("metric") != signal.get("metric"):
        raise CommentaryValidationError(f"Métrique incohérente pour {definition_id}")
    if "unit" in definition and definition.get("unit") != signal.get("unit"):
        raise CommentaryValidationError(f"Unité incohérente pour {definition_id}")
    directions = definition.get("directions")
    direction = signal.get("direction")
    if directions and direction is not None and direction not in directions:
        raise CommentaryValidationError(f"Direction incohérente pour {definition_id}: {direction}")
    if definition.get("claim_level") != signal.get("claim_level"):
        raise CommentaryValidationError(f"Niveau de preuve incohérent pour {definition_id}")


def validate_commentary(
    commentary: dict[str, Any],
    results: Iterable[dict[str, Any]],
    *,
    schema_path: Path,
    catalogue: dict[str, Any],
) -> None:
    result_list = list(results)
    result_by_id: dict[str, dict[str, Any]] = {}
    signal_by_id: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}

    for result in result_list:
        result_id = str(result.get("result_id", ""))
        if not result_id or result_id in result_by_id:
            raise CommentaryValidationError(f"result_id absent ou dupliqué : {result_id!r}")
        result_by_id[result_id] = result
        for signal in result.get("signals") or []:
            if not isinstance(signal, dict):
                raise CommentaryValidationError(f"Signal invalide dans {result_id}")
            signal_id = str(signal.get("id", ""))
            if not signal_id or signal_id in signal_by_id:
                raise CommentaryValidationError(f"signal_id absent ou dupliqué : {signal_id!r}")
            if signal.get("method") != result.get("method"):
                raise CommentaryValidationError(f"Méthode du signal incohérente : {signal_id}")
            _validate_signal_against_catalogue(signal, catalogue)
            for evidence in signal.get("evidence") or []:
                _resolve_pointer(result, str(evidence.get("result_pointer", "")))
            signal_by_id[signal_id] = (signal, result)

    schema = __import__("json").loads(schema_path.read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(commentary), key=lambda item: list(item.path))
    if errors:
        detail = "; ".join(error.message for error in errors[:3])
        raise CommentaryValidationError(f"ClimateCommentary invalide : {detail}")

    commentary_result_ids = set(commentary.get("result_ids") or [])
    if commentary_result_ids != set(result_by_id):
        raise CommentaryValidationError("result_ids du commentaire différents des ClimateResult fournis")

    if NUMBER_RE.search(str(commentary.get("summary", ""))):
        raise CommentaryValidationError("Le résumé transversal ne doit pas introduire de chiffre")

    for finding in commentary.get("findings") or []:
        signal_ids = finding.get("signal_ids") or []
        referenced: list[dict[str, Any]] = []
        finding_rank = CLAIM_RANK.get(str(finding.get("claim_level")))
        if finding_rank is None:
            raise CommentaryValidationError(f"claim_level inconnu : {finding.get('claim_level')}")
        for signal_id in signal_ids:
            if signal_id not in signal_by_id:
                raise CommentaryValidationError(f"Signal inconnu dans un finding : {signal_id}")
            signal, result = signal_by_id[signal_id]
            if (result.get("quality") or {}).get("status") in {"insufficient", "failed"}:
                raise CommentaryValidationError(f"Signal issu d'un résultat insuffisant : {signal_id}")
            signal_rank = CLAIM_RANK.get(str(signal.get("claim_level")), -1)
            if finding_rank > signal_rank:
                raise CommentaryValidationError(
                    f"Claim {finding.get('claim_level')} supérieur au signal {signal_id}"
                )
            referenced.append(signal)
        _validate_finding_numbers(str(finding.get("text", "")), referenced)

    allowed_caveats: set[str] = set()
    for signal, _ in signal_by_id.values():
        allowed_caveats.update(str(item) for item in signal.get("caveat_ids") or [])
    for result in result_list:
        allowed_caveats.update(str(item.get("id")) for item in result.get("caveats") or [] if isinstance(item, dict))

    for caveat in commentary.get("caveats") or []:
        caveat_id = str(caveat.get("id", ""))
        if caveat_id not in allowed_caveats:
            raise CommentaryValidationError(f"Caveat non justifié par les résultats : {caveat_id}")
        for signal_id in caveat.get("signal_ids") or []:
            if signal_id not in signal_by_id:
                raise CommentaryValidationError(f"Signal inconnu dans un caveat : {signal_id}")

    validation = commentary.get("validation") or {}
    if validation.get("status") != "valid" or validation.get("all_findings_have_signal_evidence") is not True:
        raise CommentaryValidationError("Un commentaire publié doit être marqué valid et entièrement ancré")
    if validation.get("unsupported_claims"):
        raise CommentaryValidationError("Un commentaire valid ne peut contenir de claim non supporté")
