from __future__ import annotations

from typing import Any, Mapping


class FingerprintEquivalenceError(AssertionError):
    pass


def _comparable_row(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: row.get(key)
        for key in ("id", "label", "source", "resolution", "metric", "unit", "reference", "years")
    }


def comparable_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Extrait la partie scientifique commune POC V4 / service P6.

    La palette, le résumé éditorial et la provenance ne sont pas utilisés pour
    décider l'équivalence scientifique.
    """
    return {
        "tile_id": payload.get("tile_id"),
        "point": payload.get("point"),
        "period": payload.get("period"),
        "reference": payload.get("reference"),
        "rows": [
            _comparable_row(row)
            for row in payload.get("rows", [])
            if isinstance(row, Mapping)
        ],
        "events": payload.get("events"),
        "comparison": payload.get("comparison"),
    }


def assert_fingerprint_equivalent(
    actual: Mapping[str, Any],
    expected: Mapping[str, Any],
) -> None:
    actual_cmp = comparable_payload(actual)
    expected_cmp = comparable_payload(expected)
    if actual_cmp != expected_cmp:
        raise FingerprintEquivalenceError(
            "Le résultat natif diffère du golden master sur le payload scientifique comparable."
        )
