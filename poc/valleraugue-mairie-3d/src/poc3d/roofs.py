"""Qualité de reconstruction des toitures, telle que Roofer la déclare lui-même.

Roofer étiquette ses propres échecs dans l'attribut ``rf_roof_type`` : sur l'emprise 200 m,
15 bâtiments sur 176 portent ``unknown``, ``no planes`` ou ``no points``. L'information était
lue puis jetée, si bien qu'une toiture inventée était indiscernable d'une toiture mesurée.

Ce module se contente de la remonter. Il ne cherche pas à réparer : signaler coûte une
fraction du prix et ne ment pas sur la donnée.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import json


# Types que Roofer produit quand il a effectivement ajusté des plans de toiture. Tout le
# reste — y compris l'attribut absent — signale une reconstruction dégradée.
RELIABLE_ROOF_TYPES = frozenset({"slanted", "horizontal", "multiple horizontal"})
MISSING_ROOF_TYPE = "absent"


def roof_type(attributes: dict[str, object]) -> str:
    value = attributes.get("rf_roof_type")
    return str(value) if isinstance(value, str) and value else MISSING_ROOF_TYPE


def is_degraded(attributes: dict[str, object]) -> bool:
    return roof_type(attributes) not in RELIABLE_ROOF_TYPES


@dataclass(frozen=True)
class RoofQuality:
    """Décompte des types de toiture et liste nominative des cas dégradés."""

    counts: dict[str, int]
    degraded: list[str]

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    @property
    def ratio(self) -> float:
        return len(self.degraded) / self.total if self.total else 0.0

    def as_metadata(self) -> dict[str, object]:
        return {
            "total": self.total,
            "counts": dict(sorted(self.counts.items())),
            "degraded": list(self.degraded),
        }


def read_roof_quality(paths: Iterable[Path]) -> RoofQuality:
    """Parcourt les CityJSONSeq et relève le ``rf_roof_type`` de chaque bâtiment.

    Les attributs BD TOPO et Roofer sont portés par le ``Building`` parent, la géométrie par
    ses ``BuildingPart`` : le décompte se fait donc sur la fusion des attributs du feature,
    comme le fait déjà la scène GLB.
    """
    counts: dict[str, int] = {}
    degraded: list[str] = []
    for path in paths:
        with path.open(encoding="utf-8") as stream:
            try:
                next(stream)
            except StopIteration:
                continue
            for line in stream:
                if not line.strip():
                    continue
                feature = json.loads(line)
                attributes = {
                    key: value
                    for city_object in feature.get("CityObjects", {}).values()
                    for key, value in city_object.get("attributes", {}).items()
                }
                if not feature.get("CityObjects"):
                    continue
                label = roof_type(attributes)
                counts[label] = counts.get(label, 0) + 1
                if label not in RELIABLE_ROOF_TYPES:
                    name = attributes.get("cleabs") or feature.get("id") or "sans identifiant"
                    degraded.append(str(name))
    return RoofQuality(counts, sorted(degraded))
