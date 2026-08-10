from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

from .compute import FingerprintSeriesInput, compute_fingerprint_data
from .signals import METHOD, build_signals

_DATASETS = [
    {
        "registry_id": "era5-land-timeseries",
        "dataset_id": "reanalysis-era5-land-timeseries",
        "variables": [
            "2m_temperature",
            "total_precipitation",
            "10m_u_component_of_wind",
            "10m_v_component_of_wind",
        ],
        "grid_degrees": 0.1,
    },
    {
        "registry_id": "era5-heat-utci-timeseries",
        "dataset_id": "derived-utci-historical-timeseries",
        "variables": ["universal_thermal_climate_index"],
        "grid_degrees": 0.25,
    },
    {
        "registry_id": "era5-drought-historical-monthly",
        "dataset_id": "derived-drought-historical-monthly",
        "variables": ["standardised_precipitation_evapotranspiration_index"],
        "grid_degrees": 0.25,
    },
]

_CAVEAT_TEXT = {
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "descriptive-not-trend": "Comparaison descriptive sans test de tendance statistique.",
    "utci-not-air-temperature": "UTCI est un indice de stress thermique, pas la température de l'air.",
    "not-r95p": "La métrique de pluie intense est un compte de jours, pas R95p/R95pTOT.",
    "not-flood-observation": "Un dépassement pluviométrique ne prouve pas une crue ou une inondation.",
    "spei3-meteorological-drought": "SPEI-3 ne mesure pas directement nappes, débits ou humidité du sol.",
    "not-storm-observation": "Vent fort dans la réanalyse ne prouve pas une tempête nommée ou des dégâts.",
}


@dataclass(frozen=True)
class FingerprintContext:
    tile_id: str
    latitude: float
    longitude: float
    snapshot_id: str
    represented: Mapping[str, Any] = field(default_factory=dict)
    generated_at: str | None = None


def _timestamp(value: str | None) -> str:
    if value:
        return value
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_climate_result(
    series: FingerprintSeriesInput,
    *,
    context: FingerprintContext,
) -> dict[str, Any]:
    """Produit directement un ClimateResult natif, sans adaptateur legacy."""

    payload = compute_fingerprint_data(
        series,
        tile_id=context.tile_id,
        latitude=context.latitude,
        longitude=context.longitude,
    )
    signals = build_signals(payload)

    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal.get("caveat_ids", []):
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)

    status = "valid" if len(signals) == 6 else ("partial" if signals else "insufficient")
    timestamp = _timestamp(context.generated_at)
    result_id = f"RESULT-FINGERPRINT-V4:{context.tile_id}:{context.snapshot_id}"

    return {
        "schema_version": "1.0",
        "result_id": result_id,
        "snapshot_id": context.snapshot_id,
        "product": {
            "id": "climate-fingerprint",
            "title": "L'empreinte climatique du lieu",
        },
        "method": deepcopy(METHOD),
        "location": {
            "requested": {
                "geometry": {
                    "type": "Point",
                    "coordinates": [context.longitude, context.latitude],
                },
                "label": context.tile_id,
                "tile_id": context.tile_id,
            },
            "represented": deepcopy(dict(context.represented)),
        },
        "periods": {
            "reference": {"start": 1991, "end": 2020},
            "study": {"start": 1996, "end": 2025},
            "comparison": {"early": "1996-2005", "late": "2016-2025"},
        },
        "datasets": deepcopy(_DATASETS),
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            **deepcopy(dict(context.represented)),
        },
        "data": payload,
        "signals": signals,
        "quality": {
            "status": status,
            "checks": [
                {
                    "id": "completeness-policy",
                    "status": "pass",
                    "scope": "annual daily metrics and monthly SPEI-3",
                    "rule": "daily annual metrics require >=90% of expected days; SPEI annual counts require all 12 calendar months; reference thresholds require >=24 complete reference years",
                    "threshold": {
                        "daily_fraction": 0.90,
                        "spei_months_per_year": 12,
                        "minimum_reference_years": 24,
                    },
                },
                {
                    "id": "comparison-signals",
                    "status": "pass" if len(signals) == 6 else "partial",
                    "count": len(signals),
                    "expected": 6,
                },
            ],
            "notes": [
                "ClimateResult produit nativement par climate-fingerprint-service.",
                "Aucun renderer et aucun modèle de langage ne participe au calcul.",
            ],
        },
        "caveats": [
            {"id": caveat_id, "text": _CAVEAT_TEXT[caveat_id], "severity": "info"}
            for caveat_id in caveat_ids
        ],
        "provenance": {
            "generated_at": timestamp,
            "generated_by": "climate_fingerprint_service.result",
            "method_id": METHOD["id"],
            "method_version": METHOD["version"],
            "snapshot_id": context.snapshot_id,
        },
    }
