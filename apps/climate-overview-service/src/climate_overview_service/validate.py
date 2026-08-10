from __future__ import annotations

from typing import Any, Mapping


def resolve_json_pointer(document: Any, pointer: str) -> Any:
    if pointer == "":
        return document
    current = document
    for token in pointer.lstrip("/").split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        current = current[int(token)] if isinstance(current, list) else current[token]
    return current


def validate_result_invariants(result: Mapping[str, Any]) -> None:
    if result.get("method") != {"id": "climate-overview", "version": "1.0.0"}:
        raise ValueError("Méthode overview invalide")
    if result.get("snapshot_id") != (result.get("provenance") or {}).get("snapshot_id"):
        raise ValueError("snapshot_id incohérent")
    signals = result.get("signals")
    if not isinstance(signals, list) or len(signals) != 7:
        raise ValueError("Sept signaux overview canoniques sont requis")
    ids = [signal.get("id") for signal in signals]
    if len(ids) != len(set(ids)):
        raise ValueError("ClimateSignal dupliqué")
    for signal in signals:
        if signal.get("method") != result.get("method"):
            raise ValueError("Méthode signal/résultat incohérente")
        for evidence in signal.get("evidence", []):
            pointer = evidence.get("result_pointer")
            if not isinstance(pointer, str):
                raise ValueError("result_pointer absent")
            resolve_json_pointer(result, pointer)
