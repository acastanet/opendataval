"""Contrat de données de l'empreinte climatique (cf. spec §18, §19, §26).

Une colonne = une année complète.
Une ligne   = un phénomène défini par un indicateur reproductible.
La couleur  = position de l'année dans la distribution 1991-2020 de cet indicateur.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Literal

PERIOD_START, PERIOD_END = 1996, 2025
REF_START, REF_END = 1991, 2020

ClassName = Literal["very_low", "low", "near_normal", "high", "very_high"]

CLASS_ORDER: tuple[ClassName, ...] = (
    "very_low", "low", "near_normal", "high", "very_high",
)

#: Vocabulaire affiché, dépendant du phénomène (spec §4).
VOCABULARY: dict[str, dict[str, str]] = {
    "temperature": {
        "very_low": "beaucoup plus froid que la normale",
        "low": "plus froid que la normale",
        "near_normal": "proche de la normale",
        "high": "plus chaud que la normale",
        "very_high": "beaucoup plus chaud que la normale",
    },
    "utci": {
        "very_low": "stress thermique très faible",
        "low": "stress thermique faible",
        "near_normal": "stress thermique proche de la normale",
        "high": "stress thermique élevé",
        "very_high": "stress thermique très élevé",
    },
    "precipitation": {
        "very_low": "beaucoup plus sec que la normale",
        "low": "plus sec que la normale",
        "near_normal": "proche de la normale",
        "high": "plus humide que la normale",
        "very_high": "beaucoup plus humide que la normale",
    },
    "extreme_rain": {
        "very_low": "très peu de pluies intenses",
        "low": "peu de pluies intenses",
        "near_normal": "proche de la normale",
        "high": "pluies intenses fréquentes",
        "very_high": "pluies intenses très fréquentes",
    },
    "drought": {
        "very_low": "sécheresse quasi absente",
        "low": "peu de sécheresse",
        "near_normal": "proche de la normale",
        "high": "sécheresse présente",
        "very_high": "sécheresse très présente",
    },
    "wind": {
        "very_low": "très peu venteux",
        "low": "peu venteux",
        "near_normal": "proche de la normale",
        "high": "venteux",
        "very_high": "très venteux",
    },
    "snow": {
        "very_low": "enneigement très faible",
        "low": "enneigement faible",
        "near_normal": "proche de la normale",
        "high": "enneigement marqué",
        "very_high": "enneigement très marqué",
    },
}


@dataclass
class TileRequest:
    """Entrée minimale du traitement (spec §18)."""

    tile_id: str
    lat: float
    lon: float
    period: tuple[int, int] = (PERIOD_START, PERIOD_END)
    reference_period: tuple[int, int] = (REF_START, REF_END)

    @property
    def collect_years(self) -> range:
        """Années à collecter : référence ∪ période racontée."""
        lo = min(self.period[0], self.reference_period[0])
        hi = max(self.period[1], self.reference_period[1])
        return range(lo, hi + 1)


@dataclass
class YearCell:
    year: int
    value: float | None = None
    anomaly: float | None = None
    percentile: float | None = None
    cls: ClassName | None = None
    rank: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        d = {
            "year": self.year,
            "value": self.value,
            "anomaly": self.anomaly,
            "percentile": self.percentile,
            "class": self.cls,
            "rank": self.rank,
        }
        if self.extra:
            d["extra"] = self.extra
        return d


@dataclass
class Row:
    id: str
    label: str
    source: str
    resolution: str
    metric: str
    unit: str
    palette: str
    #: Sens de lecture : True si une valeur haute = extrême "positif" du phénomène.
    higher_is_intense: bool = True
    years: list[YearCell] = field(default_factory=list)
    reference: dict[str, float] = field(default_factory=dict)
    trend: dict[str, Any] = field(default_factory=dict)
    decade_delta: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "source": self.source,
            "resolution": self.resolution,
            "metric": self.metric,
            "unit": self.unit,
            "palette": self.palette,
            "reference": self.reference,
            "years": [y.to_json() for y in self.years],
            "trend": self.trend,
            "decade_delta": self.decade_delta,
        }


@dataclass
class Event:
    date_start: str
    date_end: str
    family: str
    severity_percentile: float
    metrics: dict[str, Any] = field(default_factory=dict)
    label: str = ""
    label_status: str = "automatic"

    @property
    def year(self) -> int:
        return int(self.date_start[:4])

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Fingerprint:
    tile: TileRequest
    rows: list[Row] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    provenance: dict[str, Any] = field(default_factory=dict)

    @property
    def years(self) -> list[int]:
        return list(range(self.tile.period[0], self.tile.period[1] + 1))

    def to_json(self) -> dict[str, Any]:
        p0, p1 = self.tile.period
        r0, r1 = self.tile.reference_period
        return {
            "tile_id": self.tile.tile_id,
            "location": {"lat": self.tile.lat, "lon": self.tile.lon},
            "period": {"start": p0, "end": p1},
            "reference": {"start": r0, "end": r1},
            "rows": [r.to_json() for r in self.rows],
            "events": [e.to_json() for e in self.events],
            "comparison": {
                "early": f"{p0}-{p0 + 9}",
                "late": f"{p1 - 9}-{p1}",
            },
            "provenance": self.provenance,
        }


#: Définition des six lignes du MVP (spec §23).
MVP_ROWS: list[dict[str, Any]] = [
    dict(id="temperature", label="Température", source="ERA5-Land",
         resolution="0.1 degree", metric="annual_mean_2m_temperature",
         unit="degC", palette="temperature", higher_is_intense=True),
    dict(id="utci", label="Stress UTCI", source="ERA5-HEAT",
         resolution="0.25 degree", metric="annual_p95_daily_max_utci",
         unit="degC", palette="utci", higher_is_intense=True),
    dict(id="precipitation", label="Précipitations", source="ERA5-Land",
         resolution="0.1 degree", metric="annual_total_precipitation",
         unit="mm", palette="precipitation", higher_is_intense=True),
    dict(id="extreme_rain", label="Pluies intenses", source="ERA5-Land",
         resolution="0.1 degree", metric="days_above_ref_p95_wetday",
         unit="jours", palette="extreme_rain", higher_is_intense=True),
    dict(id="drought", label="Sécheresse", source="ERA5-Drought",
         resolution="0.25 degree", metric="very_dry_months_spei3",
         unit="mois", palette="drought", higher_is_intense=True),
    dict(id="wind", label="Vent fort", source="ERA5",
         resolution="0.25 degree", metric="days_above_ref_p98_wind",
         unit="jours", palette="wind", higher_is_intense=True),
]
