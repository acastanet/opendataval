from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping

METHOD = {"id": "climate-overview", "version": "1.0.0"}

_CAVEAT_TEXT = {
    "reference-climatology": "Décrit 1991-2020, pas une évolution récente.",
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "small-zone-regional-context": "Zone demandée plus petite que la maille climatique.",
    "legacy-noncanonical-extremes": (
        "Les compteurs gel, jours >=30 °C et nuits >=20 °C du POC sont conservés pour traçabilité "
        "mais exclus des signaux canoniques tant qu'ils reposent sur la température moyenne quotidienne."
    ),
}


def _signal_id(definition_id: str, lat: float, lon: float, reference: str) -> str:
    return f"{definition_id}:POINT-{lat:.4f}-{lon:.4f}:{reference}"


def _signal(
    *,
    definition_id: str,
    metric: str,
    value: Any,
    pointer: str,
    lat: float,
    lon: float,
    reference: str,
    unit: str | None,
    caveats: list[str],
) -> Dict[str, Any]:
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
        "evidence": [
            {
                "result_pointer": pointer,
                "description": "Valeur canonique du portrait climatologique préservée depuis le POC V1.",
            }
        ],
        "caveat_ids": caveats,
        "quality_status": "valid",
        "metadata": {"legacy_adapter": "climate-overview-v1-p5"},
    }


def build_signals(legacy: Mapping[str, Any]) -> list[Dict[str, Any]]:
    zone = legacy.get("zone") or {}
    centroid = zone.get("centroid") or {}
    lat = centroid.get("lat")
    lon = centroid.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        raise ValueError("Legacy climate overview centroid is invalid")

    reference_block = legacy.get("reference") or {}
    reference = f"{reference_block.get('start')}-{reference_block.get('end')}"
    annual = legacy.get("annual") or {}

    required_numeric = ["mean_temperature_c", "precipitation_mm"]
    for field in required_numeric:
        if not isinstance(annual.get(field), (int, float)):
            raise ValueError(f"Legacy climate overview is missing annual.{field}")

    month_fields = ["warmest_month", "coldest_month", "wettest_month", "driest_month"]
    for field in month_fields:
        block = annual.get(field)
        if not isinstance(block, Mapping) or not isinstance(block.get("name"), str):
            raise ValueError(f"Legacy climate overview is missing annual.{field}.name")

    signals = [
        _signal(
            definition_id="overview-annual-mean-temperature",
            metric="mean_temperature_c",
            value=annual["mean_temperature_c"],
            pointer="/data/annual/mean_temperature_c",
            lat=lat,
            lon=lon,
            reference=reference,
            unit="degC",
            caveats=["reference-climatology", "gridded-reanalysis"],
        ),
        _signal(
            definition_id="overview-annual-precipitation",
            metric="precipitation_mm",
            value=annual["precipitation_mm"],
            pointer="/data/annual/precipitation_mm",
            lat=lat,
            lon=lon,
            reference=reference,
            unit="mm_year",
            caveats=["reference-climatology", "gridded-reanalysis"],
        ),
    ]

    for field, definition_id in (
        ("warmest_month", "overview-warmest-month"),
        ("coldest_month", "overview-coldest-month"),
        ("wettest_month", "overview-wettest-month"),
        ("driest_month", "overview-driest-month"),
    ):
        signals.append(
            _signal(
                definition_id=definition_id,
                metric=field,
                value=annual[field]["name"],
                pointer=f"/data/annual/{field}/name",
                lat=lat,
                lon=lon,
                reference=reference,
                unit=None,
                caveats=["reference-climatology"],
            )
        )

    signals.append(
        _signal(
            definition_id="overview-regional-context",
            metric="representativity",
            value="gridded_reanalysis",
            pointer="/representativity/type",
            lat=lat,
            lon=lon,
            reference=reference,
            unit=None,
            caveats=["small-zone-regional-context"],
        )
    )
    return signals


def adapt_climate_overview_v1(
    legacy: Mapping[str, Any],
    *,
    source_blob_sha: str,
    generated_at: str | None = None,
) -> Dict[str, Any]:
    if not source_blob_sha:
        raise ValueError("source_blob_sha is required for a P5 golden-master adaptation")

    zone = legacy.get("zone") or {}
    centroid = zone.get("centroid") or {}
    lat = centroid.get("lat")
    lon = centroid.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        raise ValueError("Legacy climate overview centroid is invalid")

    representativity = legacy.get("representativity") or {}
    cells = representativity.get("cells") or []
    reference = legacy.get("reference") or {}
    provenance = legacy.get("provenance") or {}

    timestamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    suffix = source_blob_sha[:12]
    snapshot_id = f"LEGACY-P5-OVERVIEW-V1-{suffix}"
    result_id = f"RESULT-P5-OVERVIEW-V1-{suffix}"
    signals = build_signals(legacy)

    canonical_caveats = ["reference-climatology", "gridded-reanalysis", "small-zone-regional-context"]

    return {
        "schema_version": "1.0",
        "result_id": result_id,
        "snapshot_id": snapshot_id,
        "product": {"id": "climate-overview", "title": "Le climat de la zone"},
        "method": deepcopy(METHOD),
        "location": {
            "requested": {
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "label": "zone_test_utilisateur",
            },
            "represented": {"grid_cells": deepcopy(cells)},
        },
        "periods": {"reference": deepcopy(reference)},
        "datasets": [
            {
                "registry_id": "era5-land-timeseries",
                "dataset_id": "reanalysis-era5-land-timeseries",
                "variables": ["2m_temperature", "total_precipitation"],
                "grid_degrees": 0.1,
            }
        ],
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            "requested_geometry_type": zone.get("geometry_type"),
            "requested_area_m2": zone.get("area_m2"),
            "grid_cell_count": representativity.get("grid_cell_count"),
            "spatial_weighting": representativity.get("spatial_weighting"),
            "grid_cells": deepcopy(cells),
        },
        "data": deepcopy(dict(legacy)),
        "signals": signals,
        "quality": {
            "status": "partial",
            "checks": [
                {
                    "id": "legacy-poc-output",
                    "status": "pass",
                    "source_blob_sha": source_blob_sha,
                },
                {
                    "id": "canonical-overview-core",
                    "status": "pass",
                    "signals": len(signals),
                },
                {
                    "id": "legacy-approximate-extremes",
                    "status": "excluded",
                    "fields": [
                        "frost_days_mean",
                        "hot_days_30c_mean",
                        "tropical_nights_20c_mean",
                    ],
                },
            ],
            "notes": [
                "Le cœur température/précipitations est adapté sans recalcul. Les anciens compteurs d'extrêmes restent dans data uniquement pour traçabilité et n'émettent aucun ClimateSignal."
            ],
        },
        "caveats": [
            {"id": caveat_id, "text": _CAVEAT_TEXT[caveat_id], "severity": "info"}
            for caveat_id in canonical_caveats
        ]
        + [
            {
                "id": "legacy-noncanonical-extremes",
                "text": _CAVEAT_TEXT["legacy-noncanonical-extremes"],
                "severity": "warning",
            }
        ],
        "provenance": {
            "generated_at": timestamp,
            "generated_by": "climate_contracts.legacy_climate_overview_v1",
            "method_id": METHOD["id"],
            "method_version": METHOD["version"],
            "snapshot_id": snapshot_id,
            "legacy_source_blob_sha": source_blob_sha,
            "legacy_source": provenance.get("source"),
            "legacy_retrieval_method": provenance.get("retrieval_method"),
            "noncanonical_extremes_emitted_as_signals": False,
        },
    }


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Adapt legacy climate overview V1 to ClimateResult")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-blob-sha", required=True)
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    legacy = json.loads(args.input.read_text(encoding="utf-8"))
    result = adapt_climate_overview_v1(
        legacy,
        source_blob_sha=args.source_blob_sha,
        generated_at=args.generated_at,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
