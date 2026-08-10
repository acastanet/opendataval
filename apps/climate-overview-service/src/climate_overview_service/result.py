from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .compute import ClimateOverviewInput, OverviewContext, compute_climate_overview_data
from .signals import METHOD, build_signals

_CAVEATS = {
    "reference-climatology": "Décrit 1991-2020, pas une évolution récente.",
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "small-zone-regional-context": "Zone demandée plus petite que la maille climatique ; aucune descente d'échelle artificielle.",
}


@dataclass(frozen=True)
class ResultContext:
    tile_id: str
    latitude: float
    longitude: float
    snapshot_id: str
    grid_latitude: float
    grid_longitude: float
    area_m2: float = 0.0
    geometry_type: str = "Point"
    retrieved_at: str | None = None
    generated_at: str | None = None


def build_climate_result(series: ClimateOverviewInput, *, context: ResultContext) -> dict[str, Any]:
    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    data = compute_climate_overview_data(series, context=OverviewContext(
        latitude=context.latitude,
        longitude=context.longitude,
        grid_latitude=context.grid_latitude,
        grid_longitude=context.grid_longitude,
        area_m2=context.area_m2,
        geometry_type=context.geometry_type,
    ))
    signals = build_signals(data)
    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal.get("caveat_ids", []):
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)
    return {
        "schema_version": "1.0",
        "result_id": f"RESULT-CLIMATE-OVERVIEW-V1-{context.snapshot_id}",
        "snapshot_id": context.snapshot_id,
        "product": {"id": "climate-overview", "title": "Le climat de la zone"},
        "method": dict(METHOD),
        "location": {
            "requested": {"geometry": {"type": "Point", "coordinates": [context.longitude, context.latitude]}, "label": context.tile_id, "tile_id": context.tile_id},
            "represented": {"grid_point": {"lat": context.grid_latitude, "lon": context.grid_longitude}, "grid_resolution_deg": 0.1},
        },
        "periods": {"reference": [1991, 2020]},
        "datasets": [{"registry_id": "era5-land-timeseries", "dataset_id": "reanalysis-era5-land-timeseries", "variables": ["2m_temperature", "total_precipitation"], "grid_degrees": 0.1}],
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            "requested_point": {"lat": context.latitude, "lon": context.longitude},
            "represented_grid_point": {"lat": context.grid_latitude, "lon": context.grid_longitude},
            "grid_resolution_deg": 0.1,
            "small_zone_no_downscaling": True,
        },
        "data": data,
        "signals": signals,
        "quality": {
            "status": "valid",
            "checks": [
                {"id": "reference-months", "status": "pass", "count": len(data["monthly"])},
                {"id": "canonical-signals", "status": "pass", "count": len(signals)},
                {"id": "legacy-approximate-extremes", "status": "excluded"},
            ],
            "notes": ["Les anciens compteurs gel/chaleur/nuits tropicales fondés sur la moyenne journalière sont exclus du résultat canonique P6."],
        },
        "caveats": [{"id": caveat_id, "text": _CAVEATS[caveat_id], "severity": "info"} for caveat_id in caveat_ids],
        "provenance": {"generated_at": generated_at, "generated_by": "climate_overview_service", "method_id": METHOD["id"], "method_version": METHOD["version"], "snapshot_id": context.snapshot_id, "retrieved_at": context.retrieved_at},
    }
