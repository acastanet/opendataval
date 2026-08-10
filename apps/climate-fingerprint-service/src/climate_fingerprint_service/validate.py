from __future__ import annotations

from typing import Any, Mapping


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


def validate_result_invariants(result: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    method = result.get("method") or {}
    provenance = result.get("provenance") or {}

    if provenance.get("method_id") != method.get("id"):
        errors.append("provenance.method_id differs from method.id")
    if provenance.get("method_version") != method.get("version"):
        errors.append("provenance.method_version differs from method.version")
    if provenance.get("snapshot_id") != result.get("snapshot_id"):
        errors.append("provenance.snapshot_id differs from result.snapshot_id")

    signal_ids: set[str] = set()
    for signal in result.get("signals", []):
        signal_id = signal.get("id")
        if signal_id in signal_ids:
            errors.append(f"duplicate signal id: {signal_id}")
        signal_ids.add(signal_id)
        if signal.get("method") != method:
            errors.append(f"signal method mismatch: {signal_id}")
        for evidence in signal.get("evidence", []):
            pointer = evidence.get("result_pointer")
            try:
                resolve_json_pointer(result, pointer)
            except Exception as exc:
                errors.append(f"unresolved evidence pointer {pointer}: {exc}")
    return errors
