from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping


def comparable_payload(document: Mapping[str, Any]) -> dict[str, Any]:
    """Retourne uniquement le payload dont l'égalité numérique/scientifique est exigée.

    Les horodatages d'acquisition/génération et le moyen d'authentification sont
    de la provenance, pas des résultats scientifiques. Ils peuvent changer lors
    d'un replay sans invalider l'équivalence de thermal-seasons@1.0.0.
    """
    payload = deepcopy(dict(document))
    quality = payload.get("quality")
    if isinstance(quality, dict):
        quality.pop("generated_at", None)
    source = payload.get("source")
    if isinstance(source, dict):
        source.pop("retrieved_at", None)
        source.pop("credentials_source", None)
    return payload


def assert_thermal_seasons_equivalent(native: Mapping[str, Any], reference: Mapping[str, Any]) -> None:
    native_payload = comparable_payload(native)
    reference_payload = comparable_payload(reference)
    if native_payload != reference_payload:
        raise AssertionError("Le payload thermal-seasons natif diffère de la référence V1")
