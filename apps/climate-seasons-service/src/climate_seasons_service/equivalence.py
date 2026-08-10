from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping


def comparable_payload(document: Mapping[str, Any]) -> dict[str, Any]:
    payload = deepcopy(dict(document))
    quality = payload.get("quality")
    if isinstance(quality, dict):
        quality.pop("generated_at", None)
    return payload


def assert_thermal_seasons_equivalent(native: Mapping[str, Any], reference: Mapping[str, Any]) -> None:
    native_payload = comparable_payload(native)
    reference_payload = comparable_payload(reference)
    if native_payload != reference_payload:
        raise AssertionError("Le payload thermal-seasons natif diffère de la référence V1")
