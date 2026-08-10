from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from .compute import WaterContext, WaterThroughYearInput, compute_water_through_year_data
from .signals import METHOD, build_signals

_CAVEAT_TEXT = {
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "descriptive-not-trend": "Comparaison descriptive sans test de tendance statistique.",
    "not-water-resource": "Précipitations différentes de la ressource en eau disponible.",
    "modelled-soil-water-not-reserve-utile": "Stock dérivé ERA5-Land 0-100 cm, pas réserve utile ni observation locale.",
    "spei3-meteorological-drought": "SPEI-3 ne mesure pas directement nappes, débits ou humidité du sol.",
}


@dataclass(frozen=True)
class ResultContext:
    tile_id: str
    latitude: float
    longitude: float
    snapshot_id: str
    land_grid_latitude: float
    land_grid_longitude: float
    drought_grid_latitude: float
    drought_grid_longitude: float
    retrieved_at: str | None
    dataset_version: str | None = None
    generated_at: str | None = None


def build_climate_result(series: WaterThroughYearInput, *, context: ResultContext) -> dict:
    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    data = compute_water_through_year_data(
        series,
        context=WaterContext(
            tile_id=context.tile_id,
            latitude=context.latitude,
            longitude=context.longitude,
            land_grid_latitude=context.land_grid_latitude,
            land_grid_longitude=context.land_grid_longitude,
            drought_grid_latitude=context.drought_grid_latitude,
            drought_grid_longitude=context.drought_grid_longitude,
            dataset_version=context.dataset_version,
            retrieved_at=context.retrieved_at,
            generated_at=generated_at,
        ),
    )
    signals = build_signals(data)
    variables = data["quality"].get("variables", {})
    status = "valid" if variables and all(
        block.get("status") == "ok" and block.get("valid_months") == block.get("expected_months")
        for block in variables.values()
    ) else "partial"
    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal.get("caveat_ids", []):
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)
    return {
        "schema_version": "1.0",
        "result_id": f"RESULT-WATER-V1-{context.snapshot_id}",
        "snapshot_id": context.snapshot_id,
        "product": {"id": "water-through-year", "title": "L'eau au fil de l'année"},
        "method": dict(METHOD),
        "location": {
            "requested": {
                "geometry": {"type": "Point", "coordinates": [context.longitude, context.latitude]},
                "label": context.tile_id,
                "tile_id": context.tile_id,
            },
            "represented": {
                "era5_land_grid_point": {"lat": context.land_grid_latitude, "lon": context.land_grid_longitude},
                "grid_resolution_deg": 0.1,
                "mixed_dataset_resolution": True,
            },
        },
        "periods": dict(data["periods"]),
        "datasets": [
            {
                "registry_id": "era5-land-monthly-means",
                "dataset_id": "reanalysis-era5-land-monthly-means",
                "variables": [
                    "total_precipitation",
                    "volumetric_soil_water_layer_1",
                    "volumetric_soil_water_layer_2",
                    "volumetric_soil_water_layer_3",
                    "total_evaporation",
                ],
                "grid_degrees": 0.1,
            },
            {
                "registry_id": "era5-drought-historical-monthly",
                "dataset_id": "derived-drought-historical-monthly",
                "variables": ["standardised_precipitation_evapotranspiration_index"],
                "grid_degrees": 0.25,
            },
        ],
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            "requested_point": {"lat": context.latitude, "lon": context.longitude},
            "era5_land_grid_point": {"lat": context.land_grid_latitude, "lon": context.land_grid_longitude},
            "era5_drought_grid_point": {"lat": context.drought_grid_latitude, "lon": context.drought_grid_longitude},
            "era5_land_grid_resolution_deg": 0.1,
            "era5_drought_grid_resolution_deg": 0.25,
            "mixed_dataset_resolution": True,
        },
        "data": data,
        "signals": signals,
        "quality": {
            "status": status,
            "checks": [
                {
                    "id": "completeness-policy",
                    "status": "pass" if status == "valid" else "partial",
                    "scope": "monthly ERA5-Land and SPEI-3",
                    "rule": "420 reference+study months expected for each primary variable; annual SPEI dry-month count is emitted only when all 12 months are valid",
                    "threshold": {"expected_months": 420, "spei_months_per_year": 12},
                },
                {"id": "monthly-completeness", "status": "pass" if status == "valid" else "partial", "variables": variables},
                {"id": "three-comparison-signals", "status": "pass" if len(signals) == 3 else "partial", "count": len(signals)},
            ],
            "notes": ["Le stock 0–100 cm est une grandeur modélisée dérivée, pas une réserve utile agricole."],
        },
        "caveats": [{"id": caveat_id, "text": _CAVEAT_TEXT[caveat_id], "severity": "info"} for caveat_id in caveat_ids],
        "provenance": {
            "generated_at": generated_at,
            "generated_by": "climate_water_service.result",
            "method_id": METHOD["id"],
            "method_version": METHOD["version"],
            "snapshot_id": context.snapshot_id,
            "retrieved_at": context.retrieved_at,
        },
    }
