from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

METHOD = {"id": "climate-fingerprint", "version": "4.0.0"}

_SIGNAL_MAP = {
    "temperature": {
        "definition_id": "fingerprint-temperature-decadal-change",
        "metric": "temperature.comparison.delta",
        "value_field": "delta",
        "unit": "degC",
        "direction_mode": "higher_lower",
        "caveats": ["gridded-reanalysis", "descriptive-not-trend"],
    },
    "utci": {
        "definition_id": "fingerprint-utci-decadal-change",
        "metric": "utci.comparison.delta",
        "value_field": "delta",
        "unit": "degC_utci",
        "direction_mode": "higher_lower",
        "caveats": [
            "gridded-reanalysis",
            "descriptive-not-trend",
            "utci-not-air-temperature",
        ],
    },
    "precipitation": {
        "definition_id": "fingerprint-precipitation-decadal-change",
        "metric": "precipitation.comparison.relative_pct",
        "value_field": "relative_pct",
        "unit": "percent",
        "direction_mode": "higher_lower",
        "caveats": ["gridded-reanalysis", "descriptive-not-trend"],
    },
    "heavy_rain": {
        "definition_id": "fingerprint-heavy-rain-frequency-change",
        "metric": "heavy_rain.comparison.delta",
        "value_field": "delta",
        "unit": "days_per_year",
        "direction_mode": "frequency",
        "caveats": [
            "gridded-reanalysis",
            "descriptive-not-trend",
            "not-r95p",
            "not-flood-observation",
        ],
    },
    "drought": {
        "definition_id": "fingerprint-drought-frequency-change",
        "metric": "drought.comparison.delta",
        "value_field": "delta",
        "unit": "months_per_year",
        "direction_mode": "frequency",
        "caveats": ["descriptive-not-trend", "spei3-meteorological-drought"],
    },
    "wind": {
        "definition_id": "fingerprint-strong-wind-frequency-change",
        "metric": "wind.comparison.delta",
        "value_field": "delta",
        "unit": "days_per_year",
        "direction_mode": "frequency",
        "caveats": [
            "gridded-reanalysis",
            "descriptive-not-trend",
            "not-storm-observation",
        ],
    },
}

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


def _direction(mode: str, value: float, qualifier: str | None = None) -> str:
    # Le POC V4 possède déjà un qualificatif sémantique pour le cas « pas d'évolution nette ».
    # L'adaptateur P5 le préserve au lieu d'introduire un nouveau seuil scientifique.
    if qualifier and "pas d’évolution nette" in qualifier.lower():
        return "stable"
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


def _comparison_signal(
    metric_id: str,
    metric: Mapping[str, Any],
    *,
    tile_id: str,
    early: str,
    late: str,
) -> Dict[str, Any]:
    config = _SIGNAL_MAP[metric_id]
    value_field = config["value_field"]
    value = metric.get(value_field)
    if not isinstance(value, (int, float)):
        raise ValueError(f"Missing numeric {metric_id}.{value_field}")

    pointer = f"/data/comparison/metrics/{metric_id}/{value_field}"
    return {
        "schema_version": "1.0",
        "id": _signal_id(config["definition_id"], tile_id, early, late),
        "definition_id": config["definition_id"],
        "method": deepcopy(METHOD),
        "metric": config["metric"],
        "claim_level": "descriptive",
        "value": value,
        "unit": config["unit"],
        "direction": _direction(
            config["direction_mode"], value, metric.get("qualifier")
        ),
        "comparison": {
            "early_period": early,
            "late_period": late,
            "early_value": metric.get("early_mean"),
            "late_value": metric.get("late_mean"),
            "delta": metric.get("delta"),
            "relative_pct": metric.get("relative_pct"),
        },
        "evidence": [
            {
                "result_pointer": pointer,
                "description": "Valeur de comparaison calculée par le POC V4 et préservée dans ClimateResult.data.",
            }
        ],
        "caveat_ids": list(config["caveats"]),
        "quality_status": "valid",
        "metadata": {"legacy_adapter": "fingerprint-v4-p5"},
    }


def build_signals(legacy: Mapping[str, Any]) -> list[Dict[str, Any]]:
    comparison = legacy.get("comparison") or {}
    metrics = comparison.get("metrics") or {}
    early = comparison.get("early")
    late = comparison.get("late")
    tile_id = legacy.get("tile_id")
    if not isinstance(early, str) or not isinstance(late, str):
        raise ValueError("Legacy fingerprint is missing comparison periods")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("Legacy fingerprint is missing tile_id")

    signals = []
    for metric_id in _SIGNAL_MAP:
        metric = metrics.get(metric_id)
        if not isinstance(metric, Mapping):
            raise ValueError(f"Legacy fingerprint is missing comparison metric: {metric_id}")
        signals.append(
            _comparison_signal(metric_id, metric, tile_id=tile_id, early=early, late=late)
        )
    return signals


def adapt_fingerprint_v4(
    legacy: Mapping[str, Any],
    *,
    source_blob_sha: str,
    generated_at: str | None = None,
) -> Dict[str, Any]:
    if not source_blob_sha:
        raise ValueError("source_blob_sha is required for a P5 golden-master adaptation")

    point = legacy.get("point") or {}
    lon = point.get("lon")
    lat = point.get("lat")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        raise ValueError("Legacy fingerprint point is invalid")

    tile_id = legacy.get("tile_id")
    period = legacy.get("period") or {}
    reference = legacy.get("reference") or {}
    provenance = legacy.get("provenance") or {}
    grid_points = provenance.get("grid_points") or {}
    comparison = legacy.get("comparison") or {}

    timestamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    suffix = source_blob_sha[:12]
    snapshot_id = f"LEGACY-P5-FINGERPRINT-V4-{suffix}"
    result_id = f"RESULT-P5-FINGERPRINT-V4-{suffix}"

    signals = build_signals(legacy)
    caveat_ids = []
    for signal in signals:
        for caveat_id in signal.get("caveat_ids", []):
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)

    return {
        "schema_version": "1.0",
        "result_id": result_id,
        "snapshot_id": snapshot_id,
        "product": {
            "id": "climate-fingerprint",
            "title": "L'empreinte climatique du lieu",
        },
        "method": deepcopy(METHOD),
        "location": {
            "requested": {
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "label": str(tile_id),
                "tile_id": str(tile_id),
            },
            "represented": {
                "grid_points": deepcopy(grid_points),
                "legacy_disclaimer": provenance.get("disclaimer"),
            },
        },
        "periods": {
            "reference": {
                "start": reference.get("start"),
                "end": reference.get("end"),
            },
            "study": {"start": period.get("start"), "end": period.get("end")},
            "comparison": {
                "early": comparison.get("early"),
                "late": comparison.get("late"),
            },
        },
        "datasets": deepcopy(_DATASETS),
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            "grid_points": deepcopy(grid_points),
        },
        # P5 préserve le payload du POC sans modification numérique. Le futur service P6
        # pourra produire un data payload natif après démonstration d'équivalence.
        "data": deepcopy(dict(legacy)),
        "signals": signals,
        "quality": {
            "status": "valid",
            "checks": [
                {"id": "legacy-golden-master", "status": "pass"},
                {"id": "six-comparison-signals", "status": "pass", "count": len(signals)},
            ],
            "notes": [
                "Adaptation contractuelle P5 d'une sortie POC existante ; aucun recalcul climatique."
            ],
        },
        "caveats": [
            {"id": caveat_id, "text": _CAVEAT_TEXT[caveat_id], "severity": "info"}
            for caveat_id in caveat_ids
        ],
        "provenance": {
            "generated_at": timestamp,
            "generated_by": "climate_contracts.legacy_fingerprint_v4",
            "method_id": METHOD["id"],
            "method_version": METHOD["version"],
            "snapshot_id": snapshot_id,
            "legacy_source_blob_sha": source_blob_sha,
            "legacy_generated_by": provenance.get("generated_by"),
            "legacy_summary_ignored_as_evidence": True,
        },
    }


def resolve_json_pointer(document: Any, pointer: str) -> Any:
    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise ValueError(f"Not a JSON Pointer: {pointer}")
    current = document
    for raw_token in pointer.split("/")[1:]:
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list):
            current = current[int(token)]
        else:
            current = current[token]
    return current


def validate_cross_document_invariants(result: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    method = result.get("method")
    provenance = result.get("provenance") or {}
    if provenance.get("method_id") != (method or {}).get("id"):
        errors.append("provenance.method_id differs from method.id")
    if provenance.get("method_version") != (method or {}).get("version"):
        errors.append("provenance.method_version differs from method.version")
    if provenance.get("snapshot_id") != result.get("snapshot_id"):
        errors.append("provenance.snapshot_id differs from result.snapshot_id")

    signal_ids: set[str] = set()
    for signal in result.get("signals", []):
        signal_id = signal.get("id")
        if signal_id in signal_ids:
            errors.append(f"duplicate signal id: {signal_id}")
        signal_ids.add(signal_id)
        if signal.get("method") != method:
            errors.append(f"signal method mismatch: {signal_id}")
        for evidence in signal.get("evidence", []):
            pointer = evidence.get("result_pointer")
            try:
                resolve_json_pointer(result, pointer)
            except Exception as exc:  # noqa: BLE001 - validator must report any pointer failure
                errors.append(f"unresolved evidence pointer {pointer}: {exc}")
    return errors


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Adapt legacy climate fingerprint V4 to ClimateResult")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-blob-sha", required=True)
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    legacy = json.loads(args.input.read_text(encoding="utf-8"))
    result = adapt_fingerprint_v4(
        legacy,
        source_blob_sha=args.source_blob_sha,
        generated_at=args.generated_at,
    )
    errors = validate_cross_document_invariants(result)
    if errors:
        raise SystemExit("Contract invariant failure:\n- " + "\n- ".join(errors))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
