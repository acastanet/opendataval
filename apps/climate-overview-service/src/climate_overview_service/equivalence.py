from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping


def comparable_payload(data: Mapping[str, Any]) -> dict[str, Any]:
    """Noyau canonique V1 ; ignore les anciens compteurs d'extrêmes non canoniques."""
    annual = data.get("annual") or {}
    return {
        "zone": deepcopy(data.get("zone")),
        "reference": deepcopy(data.get("reference")),
        "representativity": deepcopy(data.get("representativity")),
        "monthly": deepcopy(data.get("monthly")),
        "annual": {
            key: deepcopy(annual.get(key))
            for key in (
                "mean_temperature_c",
                "precipitation_mm",
                "warmest_month",
                "coldest_month",
                "wettest_month",
                "driest_month",
            )
        },
    }


def assert_overview_equivalent(actual: Mapping[str, Any], expected: Mapping[str, Any]) -> None:
    left, right = comparable_payload(actual), comparable_payload(expected)
    if left != right:
        raise AssertionError(f"Climate overview canonical payload differs:\nactual={left!r}\nexpected={right!r}")
