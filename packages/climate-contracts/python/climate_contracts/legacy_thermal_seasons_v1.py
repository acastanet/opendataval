from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping

METHOD = {"id": "thermal-seasons", "version": "1.0.0"}

_SIGNAL_CONFIG = {
    "spring_start_shift_days": {
        "definition_id": "thermal-spring-start-shift",
        "metric": "spring_start_shift_days",
        "unit": "days",
        "direction_mode": "date_shift",
        "decade_metric": "spring_start",
        "caveats": [
            "thermal-not-meteorological-season",
            "gridded-reanalysis",
            "descriptive-not-trend",
        ],
    },
    "summer_start_shift_days": {
        "definition_id": "thermal-summer-start-shift",
        "metric": "summer_start_shift_days",
        "unit": "days",
        "direction_mode": "date_shift",
        "decade_metric": "summer_start",
        "caveats": [
            "thermal-not-meteorological-season",
            "gridded-reanalysis",
            "descriptive-not-trend",
        ],
    },
    "autumn_start_shift_days": {
        "definition_id": "thermal-autumn-start-shift",
        "metric": "autumn_start_shift_days",
        "unit": "days",
        "direction_mode": "date_shift",
        "decade_metric": "autumn_start",
        "caveats": [
            "thermal-not-meteorological-season",
            "gridded-reanalysis",
            "descriptive-not-trend",
        ],
    },
    "winter_start_shift_days": {
        "definition_id": "thermal-winter-start-shift",
        "metric": "winter_start_shift_days",
        "unit": "days",
        "direction_mode": "date_shift",
        "decade_metric": "winter_start",
        "caveats": [
            "thermal-not-meteorological-season",
            "gridded-reanalysis",
            "descriptive-not-trend",
        ],
    },
    "summer_length_change_days": {
        "definition_id": "thermal-summer-length-change",
        "metric": "summer_length_change_days",
        "unit": "days",
        "direction_mode": "length_change",
        "decade_metric": "summer_length",
        "caveats": [
            "thermal-not-meteorological-season",
            "descriptive-not-trend",
            "not-heatwave-duration",
        ],
    },
}

_CAVEAT_TEXT = {
    "thermal-not-meteorological-season": (
        "Saison thermique locale T25/T75, pas saison fixe DJF/MAM/JJA/SON."
    ),
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "descriptive-not-trend": "Comparaison descriptive sans test de tendance statistique.",
    "not-heatwave-duration": "Durée d'été thermique différente de la durée des canicules.",
}


def _period_label(value: Any) -> str:
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f"Invalid period: {value!r}")
    return f"{value[0]}-{value[1]}"


def _direction(mode: str, value: float) -> str:
    if value == 0:
        return "stable"
    if mode == "date_shift":
        return "earlier" if value < 0 else "later"
    if mode == "length_change":
        return "longer" if value > 0 else "shorter"
    raise ValueError(f"Unsupported direction mode: {mode}")


def _signal_id(definition_id: str, tile_id: str, early: str, late: str) -> str:
    safe_tile = tile_id.replace("/", "-").replace(" ", "-")
    return f"{definition_id}:{safe_tile}:{early}_vs_{late}"


def _median(decades: Mapping[str, Any], period: str, metric: str) -> float | None:
    block = decades.get(period)
    if not isinstance(block, Mapping):
        return None
    metric_block = block.get(metric)
    if not isinstance(metric_block, Mapping):
        return None
    value = metric_block.get("median")
    return value if isinstance(value, (int, float)) else None


def build_signals(legacy: Mapping[str, Any]) -> list[Dict[str, Any]]:
    periods = legacy.get("periods") or {}
    early = _period_label(periods.get("early"))
    late = _period_label(periods.get("late"))
    tile = legacy.get("tile") or {}
    tile_id = tile.get("tile_id")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("Legacy thermal seasons fixture is missing tile.tile_id")

    comparison = legacy.get("comparison") or {}
    decades = legacy.get("decades") or {}
    signals: list[Dict[str, Any]] = []

    for field, config in _SIGNAL_CONFIG.items():
        value = comparison.get(field)
        if not isinstance(value, (int, float)):
            raise ValueError(f"Legacy thermal seasons fixture is missing numeric comparison.{field}")

        decade_metric = config["decade_metric"]
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
                    "early_value": _median(decades, early, decade_metric),
                    "late_value": _median(decades, late, decade_metric),
                    "delta": value,
                    "relative_pct": None,
                },
                "evidence": [
                    {
                        "result_pointer": f"/data/comparison/{field}",
                        "description": (
                            "Valeur de comparaison figée par le POC saisons V1 et préservée "
                            "dans ClimateResult.data."
                        ),
                    }
                ],
                "caveat_ids": list(config["caveats"]),
                "quality_status": "valid",
                "metadata": {
                    "legacy_adapter": "thermal-seasons-v1-p5",
                    "comparison_statistic": "median",
                },
            }
        )
    return signals


def adapt_thermal_seasons_v1(
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
        raise ValueError("Legacy thermal seasons tile coordinates are invalid")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("Legacy thermal seasons tile_id is invalid")

    source = legacy.get("source") or {}
    grid_lat = source.get("grid_lat")
    grid_lon = source.get("grid_lon")
    grid_resolution = source.get("grid_resolution_deg")
    periods = legacy.get("periods") or {}
    quality = legacy.get("quality") or {}

    timestamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    suffix = source_blob_sha[:12]
    snapshot_id = f"LEGACY-P5-THERMAL-SEASONS-V1-{suffix}"
    result_id = f"RESULT-P5-THERMAL-SEASONS-V1-{suffix}"
    signals = build_signals(legacy)

    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal.get("caveat_ids", []):
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)

    annual_ok = quality.get("annual_ok")
    annual_total = quality.get("annual_total")
    result_quality = "partial" if annual_ok != annual_total else "valid"

    return {
        "schema_version": "1.0",
        "result_id": result_id,
        "snapshot_id": snapshot_id,
        "product": {
            "id": "thermal-seasons",
            "title": "Les saisons se déplacent",
        },
        "method": deepcopy(METHOD),
        "location": {
            "requested": {
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "label": tile_id,
                "tile_id": tile_id,
            },
            "represented": {
                "grid_point": {"lat": grid_lat, "lon": grid_lon},
                "grid_resolution_deg": grid_resolution,
            },
        },
        "periods": deepcopy(periods),
        "datasets": [
            {
                "registry_id": "era5-land-timeseries",
                "dataset_id": "reanalysis-era5-land-timeseries",
                "variables": ["2m_temperature"],
                "grid_degrees": grid_resolution,
            }
        ],
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            "requested_point": {"lat": lat, "lon": lon},
            "represented_grid_point": {"lat": grid_lat, "lon": grid_lon},
            "grid_resolution_deg": grid_resolution,
        },
        "data": deepcopy(dict(legacy)),
        "signals": signals,
        "quality": {
            "status": result_quality,
            "checks": [
                {
                    "id": "legacy-regression-fixture",
                    "status": "pass",
                    "source_blob_sha": source_blob_sha,
                },
                {
                    "id": "annual-crossings",
                    "status": "partial" if result_quality == "partial" else "pass",
                    "annual_ok": annual_ok,
                    "annual_total": annual_total,
                },
                {
                    "id": "five-comparison-signals",
                    "status": "pass",
                    "count": len(signals),
                },
            ],
            "notes": [
                "Adaptation contractuelle P5 de la fixture de non-régression existante ; aucune frontière saisonnière n'est recalculée."
            ],
        },
        "caveats": [
            {"id": caveat_id, "text": _CAVEAT_TEXT[caveat_id], "severity": "info"}
            for caveat_id in caveat_ids
        ],
        "provenance": {
            "generated_at": timestamp,
            "generated_by": "climate_contracts.legacy_thermal_seasons_v1",
            "method_id": METHOD["id"],
            "method_version": METHOD["version"],
            "snapshot_id": snapshot_id,
            "legacy_source_blob_sha": source_blob_sha,
            "legacy_dataset": source.get("dataset"),
            "legacy_retrieved_at": source.get("retrieved_at"),
            "legacy_generated_at": quality.get("generated_at"),
            "legacy_regression_fixture": True,
        },
    }


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Adapt legacy thermal seasons V1 to ClimateResult")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-blob-sha", required=True)
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    legacy = json.loads(args.input.read_text(encoding="utf-8"))
    result = adapt_thermal_seasons_v1(
        legacy,
        source_blob_sha=args.source_blob_sha,
        generated_at=args.generated_at,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
