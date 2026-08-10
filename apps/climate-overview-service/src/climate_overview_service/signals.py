from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

METHOD = {"id": "climate-overview", "version": "1.0.0"}


def _signal_id(definition_id: str, lat: float, lon: float, reference: str) -> str:
    return f"{definition_id}:POINT-{lat:.4f}-{lon:.4f}:{reference}"


def _signal(*, definition_id: str, metric: str, value: Any, pointer: str, lat: float, lon: float,
            reference: str, unit: str | None, caveats: list[str]) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "id": _signal_id(definition_id, lat, lon, reference),
        "definition_id": definition_id,
        "method": deepcopy(METHOD),
        "metric": metric,
        "claim_level": "descriptive",
        "value": value,
        "unit": unit,
        "direction": None,
        "evidence": [{"result_pointer": pointer, "description": "Valeur canonique du portrait climatologique calculée par climate-overview-service."}],
        "caveat_ids": caveats,
        "quality_status": "valid",
        "metadata": {"native_service": "climate-overview-service"},
    }


def build_signals(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    centroid = (data.get("zone") or {}).get("centroid") or {}
    lat, lon = centroid.get("lat"), centroid.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        raise ValueError("Centroid overview invalide")
    ref = data.get("reference") or {}
    reference = f"{ref.get('start')}-{ref.get('end')}"
    annual = data.get("annual") or {}
    result = [
        _signal(definition_id="overview-annual-mean-temperature", metric="mean_temperature_c", value=annual["mean_temperature_c"], pointer="/data/annual/mean_temperature_c", lat=lat, lon=lon, reference=reference, unit="degC", caveats=["reference-climatology", "gridded-reanalysis"]),
        _signal(definition_id="overview-annual-precipitation", metric="precipitation_mm", value=annual["precipitation_mm"], pointer="/data/annual/precipitation_mm", lat=lat, lon=lon, reference=reference, unit="mm_year", caveats=["reference-climatology", "gridded-reanalysis"]),
    ]
    for field, definition_id in (
        ("warmest_month", "overview-warmest-month"),
        ("coldest_month", "overview-coldest-month"),
        ("wettest_month", "overview-wettest-month"),
        ("driest_month", "overview-driest-month"),
    ):
        result.append(_signal(definition_id=definition_id, metric=field, value=annual[field]["name"], pointer=f"/data/annual/{field}/name", lat=lat, lon=lon, reference=reference, unit=None, caveats=["reference-climatology"]))
    result.append(_signal(definition_id="overview-regional-context", metric="representativity", value="gridded_reanalysis", pointer="/representativity/type", lat=lat, lon=lon, reference=reference, unit=None, caveats=["small-zone-regional-context"]))
    return result
