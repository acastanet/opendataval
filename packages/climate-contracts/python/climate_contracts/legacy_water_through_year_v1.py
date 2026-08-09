from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping

METHOD = {"id": "water-through-year", "version": "1.0.0"}

_SIGNAL_CONFIG = {
    "annual_precip_change_pct": {
        "definition_id": "water-annual-precipitation-change",
        "metric": "annual_precip_change_pct",
        "unit": "percent",
        "direction_mode": "higher_lower",
        "caveats": ["gridded-reanalysis", "descriptive-not-trend", "not-water-resource"],
    },
    "summer_soil_water_change_mm": {
        "definition_id": "water-summer-soil-water-change",
        "metric": "summer_soil_water_change_mm",
        "unit": "mm_modelled_water_equivalent",
        "direction_mode": "higher_lower",
        "caveats": [
            "modelled-soil-water-not-reserve-utile",
            "gridded-reanalysis",
            "descriptive-not-trend",
        ],
    },
    "dry_months_change": {
        "definition_id": "water-dry-months-change",
        "metric": "dry_months_change",
        "unit": "months_per_year",
        "direction_mode": "frequency",
        "caveats": ["spei3-meteorological-drought", "descriptive-not-trend"],
    },
}

_CAVEAT_TEXT = {
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "descriptive-not-trend": "Comparaison descriptive sans test de tendance statistique.",
    "not-water-resource": "Précipitations différentes de la ressource en eau disponible.",
    "modelled-soil-water-not-reserve-utile": (
        "Stock dérivé ERA5-Land 0-100 cm, pas réserve utile ni observation locale."
    ),
    "spei3-meteorological-drought": (
        "SPEI-3 ne mesure pas directement nappes, débits ou humidité du sol."
    ),
}


def _period_label(value: Any) -> str:
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f"Invalid period: {value!r}")
    return f"{value[0]}-{value[1]}"


def _direction(mode: str, value: float) -> str:
    if value == 0:
        return "stable"
    if mode == "higher_lower":
        return "higher" if value > 0 else "lower"
    if mode == "frequency":
        return "more_frequent" if value > 0 else "less_frequent"
    raise ValueError(f"Unsupported direction mode: {mode}")


def _signal_id(definition_id: str, tile_id: str, early: str, late: str) -> str:
    safe_tile = tile_id.replace("/", "-").replace(" ", "-")
    return f"{definition_id}:{safe_tile}:{early}_vs_{late}"


def build_signals(legacy: Mapping[str, Any]) -> list[Dict[str, Any]]:
    periods = legacy.get("periods") or {}
    early = _period_label(periods.get("early"))
    late = _period_label(periods.get("late"))
    tile = legacy.get("tile") or {}
    tile_id = tile.get("tile_id")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("Legacy water output is missing tile.tile_id")

    comparison = legacy.get("comparison") or {}
    signals: list[Dict[str, Any]] = []
    for field, config in _SIGNAL_CONFIG.items():
        value = comparison.get(field)
        if not isinstance(value, (int, float)):
            raise ValueError(f"Legacy water output is missing numeric comparison.{field}")
        signals.append(
            {
                "schema_version": "1.0",
                "id": _signal_id(config["definition_id"], tile_id, early, late),
                "definition_id": config["definition_id"],
                "method": deepcopy(METHOD),
                "metric": config["metric"],
                "claim_level": "descriptive",
                "value": value,
                "unit": config["unit"],
                "direction": _direction(config["direction_mode"], value),
                "comparison": {
                    "early_period": early,
                    "late_period": late,
                    "early_value": None,
                    "late_value": None,
                    "delta": value,
                    "relative_pct": value if field == "annual_precip_change_pct" else None,
                },
                "evidence": [
                    {
                        "result_pointer": f"/data/comparison/{field}",
                        "description": (
                            "Valeur de comparaison calculée par le POC eau V1 et préservée "
                            "dans ClimateResult.data."
                        ),
                    }
                ],
                "caveat_ids": list(config["caveats"]),
                "quality_status": "valid",
                "metadata": {"legacy_adapter": "water-through-year-v1-p5"},
            }
        )
    return signals


def _quality_status(legacy: Mapping[str, Any]) -> str:
    variables = ((legacy.get("quality") or {}).get("variables") or {})
    if not variables:
        return "insufficient"
    for block in variables.values():
        if not isinstance(block, Mapping):
            return "insufficient"
        if block.get("status") != "ok":
            return "partial"
        if block.get("valid_months") != block.get("expected_months"):
            return "partial"
    return "valid"


def adapt_water_through_year_v1(
    legacy: Mapping[str, Any],
    *,
    source_blob_sha: str,
    generated_at: str | None = None,
) -> Dict[str, Any]:
    if not source_blob_sha:
        raise ValueError("source_blob_sha is required for a P5 golden-master adaptation")

    tile = legacy.get("tile") or {}
    lat = tile.get("lat")
    lon = tile.get("lon")
    tile_id = tile.get("tile_id")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        raise ValueError("Legacy water tile coordinates are invalid")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("Legacy water tile_id is invalid")

    representativity = legacy.get("representativity") or {}
    periods = legacy.get("periods") or {}
    sources = legacy.get("sources") or {}
    quality = legacy.get("quality") or {}
    grid_resolution = representativity.get("grid_resolution_deg")

    timestamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    suffix = source_blob_sha[:12]
    snapshot_id = f"LEGACY-P5-WATER-V1-{suffix}"
    result_id = f"RESULT-P5-WATER-V1-{suffix}"
    signals = build_signals(legacy)
    result_quality = _quality_status(legacy)

    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal.get("caveat_ids", []):
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)

    return {
        "schema_version": "1.0",
        "result_id": result_id,
        "snapshot_id": snapshot_id,
        "product": {"id": "water-through-year", "title": "L'eau au fil de l'année"},
        "method": deepcopy(METHOD),
        "location": {
            "requested": {
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "label": tile_id,
                "tile_id": tile_id,
            },
            "represented": {
                "era5_land_grid_point": {
                    "lat": representativity.get("grid_lat"),
                    "lon": representativity.get("grid_lon"),
                },
                "grid_resolution_deg": grid_resolution,
                "mixed_dataset_resolution": True,
            },
        },
        "periods": deepcopy(periods),
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
                "grid_degrees": grid_resolution,
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
            "requested_point": {"lat": lat, "lon": lon},
            "era5_land_grid_point": {
                "lat": representativity.get("grid_lat"),
                "lon": representativity.get("grid_lon"),
            },
            "era5_land_grid_resolution_deg": grid_resolution,
            "mixed_dataset_resolution": True,
        },
        "data": deepcopy(dict(legacy)),
        "signals": signals,
        "quality": {
            "status": result_quality,
            "checks": [
                {
                    "id": "legacy-poc-output",
                    "status": "pass",
                    "source_blob_sha": source_blob_sha,
                },
                {
                    "id": "monthly-completeness",
                    "status": "pass" if result_quality == "valid" else result_quality,
                    "variables": deepcopy(quality.get("variables")),
                },
                {"id": "three-comparison-signals", "status": "pass", "count": len(signals)},
            ],
            "notes": [
                "Adaptation contractuelle P5 de la sortie POC suivie dans Git ; aucun indicateur hydroclimatique n'est recalculé."
            ],
        },
        "caveats": [
            {"id": caveat_id, "text": _CAVEAT_TEXT[caveat_id], "severity": "info"}
            for caveat_id in caveat_ids
        ],
        "provenance": {
            "generated_at": timestamp,
            "generated_by": "climate_contracts.legacy_water_through_year_v1",
            "method_id": METHOD["id"],
            "method_version": METHOD["version"],
            "snapshot_id": snapshot_id,
            "legacy_source_blob_sha": source_blob_sha,
            "legacy_dataset_version": sources.get("dataset_version"),
            "legacy_retrieved_at": sources.get("retrieved_at"),
            "legacy_generated_at": quality.get("generated_at"),
        },
    }


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Adapt legacy water-through-year V1 to ClimateResult")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-blob-sha", required=True)
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    legacy = json.loads(args.input.read_text(encoding="utf-8"))
    result = adapt_water_through_year_v1(
        legacy,
        source_blob_sha=args.source_blob_sha,
        generated_at=args.generated_at,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
