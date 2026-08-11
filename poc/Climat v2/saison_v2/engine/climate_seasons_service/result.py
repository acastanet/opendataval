from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

from .compute import ThermalSeasonsContext, ThermalSeasonsInput, compute_thermal_seasons_data
from .signals import METHOD, build_signals

_CAVEAT_TEXT = {
    "thermal-not-meteorological-season": "Saison thermique locale T25/T75, pas saison fixe DJF/MAM/JJA/SON.",
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "descriptive-not-trend": "Comparaison descriptive sans test de tendance statistique.",
    "not-heatwave-duration": "Durée d'été thermique différente de la durée des canicules.",
}


@dataclass(frozen=True)
class ResultContext:
    tile_id: str
    latitude: float
    longitude: float
    snapshot_id: str
    grid_latitude: float | None
    grid_longitude: float | None
    retrieved_at: str | None
    generated_at: str | None = None


def build_climate_result(
    series: ThermalSeasonsInput,
    *,
    context: ResultContext,
) -> dict[str, Any]:
    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    data = compute_thermal_seasons_data(
        series,
        context=ThermalSeasonsContext(
            tile_id=context.tile_id,
            latitude=context.latitude,
            longitude=context.longitude,
            grid_latitude=context.grid_latitude,
            grid_longitude=context.grid_longitude,
            retrieved_at=context.retrieved_at,
            credentials_source=None,
            generated_at=generated_at,
        ),
    )
    signals = build_signals(data)
    annual_ok = data["quality"].get("annual_ok")
    annual_total = data["quality"].get("annual_total")
    quality_status = "partial" if annual_ok != annual_total else "valid"

    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal.get("caveat_ids", []):
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)

    result_id = f"RESULT-THERMAL-SEASONS-V1-{context.snapshot_id}"
    return {
        "schema_version": "1.0",
        "result_id": result_id,
        "snapshot_id": context.snapshot_id,
        "product": {"id": "thermal-seasons", "title": "Les saisons se déplacent"},
        "method": dict(METHOD),
        "location": {
            "requested": {
                "geometry": {"type": "Point", "coordinates": [context.longitude, context.latitude]},
                "label": context.tile_id,
                "tile_id": context.tile_id,
            },
            "represented": {
                "grid_point": {"lat": context.grid_latitude, "lon": context.grid_longitude},
                "grid_resolution_deg": 0.1,
            },
        },
        "periods": dict(data["periods"]),
        "datasets": [
            {
                "registry_id": "era5-land-timeseries",
                "dataset_id": "reanalysis-era5-land-timeseries",
                "variables": ["2m_temperature"],
                "grid_degrees": 0.1,
            }
        ],
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            "requested_point": {"lat": context.latitude, "lon": context.longitude},
            "represented_grid_point": {"lat": context.grid_latitude, "lon": context.grid_longitude},
            "grid_resolution_deg": 0.1,
        },
        "data": data,
        "signals": signals,
        "quality": {
            "status": quality_status,
            "checks": [
                {
                    "id": "completeness-policy",
                    "status": "pass" if quality_status == "valid" else "partial",
                    "scope": "hourly ERA5-Land converted to no-leap daily years before thermal crossings",
                    "rule": "daily mean requires >=18 hourly values; annual input requires >=98% valid no-leap days; internal gaps up to 2 days may be interpolated before crossing QA",
                    "threshold": {
                        "minimum_hourly_values_per_day": 18,
                        "minimum_annual_fraction": 0.98,
                        "maximum_interpolated_gap_days": 2,
                    },
                },
                {"id": "annual-crossings", "status": "partial" if quality_status == "partial" else "pass", "annual_ok": annual_ok, "annual_total": annual_total},
                {"id": "five-comparison-signals", "status": "pass", "count": len(signals)},
            ],
            "notes": [
                "Une année avec franchissements invalides reste visible comme donnée partielle ; les comparaisons utilisent uniquement les années valides."
            ],
        },
        "caveats": [
            {"id": caveat_id, "text": _CAVEAT_TEXT[caveat_id], "severity": "info"}
            for caveat_id in caveat_ids
        ],
        "provenance": {
            "generated_at": generated_at,
            "generated_by": "climate_seasons_service",
            "method_id": METHOD["id"],
            "method_version": METHOD["version"],
            "snapshot_id": context.snapshot_id,
            "retrieved_at": context.retrieved_at,
        },
    }
