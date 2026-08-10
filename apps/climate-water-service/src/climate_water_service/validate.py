from __future__ import annotations

from typing import Any, Mapping


def resolve_json_pointer(document: Mapping[str, Any], pointer: str) -> Any:
    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise ValueError(f"JSON Pointer invalide: {pointer}")
    current: Any = document
    for token in pointer[1:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, Mapping):
            current = current[token]
        elif isinstance(current, list):
            current = current[int(token)]
        else:
            raise KeyError(pointer)
    return current


def validate_result_invariants(result: Mapping[str, Any]) -> None:
    method = result.get("method")
    if method != {"id": "water-through-year", "version": "1.0.0"}:
        raise ValueError("Méthode water-through-year@1.0.0 attendue")
    signals = result.get("signals")
    if not isinstance(signals, list):
        raise ValueError("signals doit être une liste")
    ids: set[str] = set()
    for signal in signals:
        if signal.get("method") != method:
            raise ValueError("Méthode signal/résultat incohérente")
        signal_id = signal.get("id")
        if signal_id in ids:
            raise ValueError("Signal dupliqué")
        ids.add(signal_id)
        for evidence in signal.get("evidence", []):
            resolve_json_pointer(result, evidence["result_pointer"])
