from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping


def comparable_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    result = deepcopy(dict(payload))
    sources = result.get("sources")
    if isinstance(sources, dict):
        sources.pop("retrieved_at", None)
    quality = result.get("quality")
    if isinstance(quality, dict):
        quality.pop("generated_at", None)
    return result


def assert_water_equivalent(actual: Mapping[str, Any], expected: Mapping[str, Any]) -> None:
    left, right = comparable_payload(actual), comparable_payload(expected)
    if left != right:
        import json
        raise AssertionError(
            "Le calcul water-through-year natif diffère de la référence.\nACTUAL:\n"
            + json.dumps(left, ensure_ascii=False, indent=2, sort_keys=True)
            + "\nEXPECTED:\n"
            + json.dumps(right, ensure_ascii=False, indent=2, sort_keys=True)
        )
