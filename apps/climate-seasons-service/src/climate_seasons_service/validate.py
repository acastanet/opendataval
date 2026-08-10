from __future__ import annotations

from typing import Any, Mapping


def resolve_json_pointer(document: Any, pointer: str) -> Any:
    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise ValueError(f"JSON Pointer invalide: {pointer}")
    current = document
    for raw_token in pointer.split("/")[1:]:
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, Mapping):
            if token not in current:
                raise KeyError(pointer)
            current = current[token]
        elif isinstance(current, list):
            current = current[int(token)]
        else:
            raise KeyError(pointer)
    return current


def validate_result_invariants(result: Mapping[str, Any]) -> None:
    method = result.get("method")
    provenance = result.get("provenance") or {}
    if not isinstance(method, Mapping):
        raise ValueError("method manquant")
    if provenance.get("method_id") != method.get("id") or provenance.get("method_version") != method.get("version"):
        raise ValueError("provenance.method != result.method")
    if provenance.get("snapshot_id") != result.get("snapshot_id"):
        raise ValueError("provenance.snapshot_id != result.snapshot_id")

    signals = result.get("signals")
    if not isinstance(signals, list) or len(signals) != 5:
        raise ValueError("thermal-seasons@1.0.0 doit produire exactement cinq signaux")
    for signal in signals:
        signal_method = signal.get("method") or {}
        if signal_method.get("id") != method.get("id") or signal_method.get("version") != method.get("version"):
            raise ValueError("signal.method != result.method")
        evidence = signal.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise ValueError("signal.evidence manquant")
        for item in evidence:
            pointer = item.get("result_pointer")
            if not isinstance(pointer, str):
                raise ValueError("evidence.result_pointer manquant")
            resolve_json_pointer(result, pointer)
