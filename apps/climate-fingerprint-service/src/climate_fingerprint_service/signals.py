from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

METHOD = {"id": "climate-fingerprint", "version": "4.0.0"}

_SIGNAL_MAP = {
    "temperature": {
        "definition_id": "fingerprint-temperature-decadal-change",
        "metric": "temperature.comparison.delta",
        "value_field": "delta",
        "unit": "degC",
        "direction_mode": "higher_lower",
        "yearly_statistic": "annual_mean",
        "caveats": ["gridded-reanalysis", "descriptive-not-trend"],
    },
    "utci": {
        "definition_id": "fingerprint-utci-decadal-change",
        "metric": "utci.comparison.delta",
        "value_field": "delta",
        "unit": "degC_utci",
        "direction_mode": "higher_lower",
        "yearly_statistic": "annual_p95_daily_max",
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
        "yearly_statistic": "annual_sum",
        "caveats": ["gridded-reanalysis", "descriptive-not-trend"],
    },
    "heavy_rain": {
        "definition_id": "fingerprint-heavy-rain-frequency-change",
        "metric": "heavy_rain.comparison.delta",
        "value_field": "delta",
        "unit": "days_per_year",
        "direction_mode": "frequency",
        "yearly_statistic": "annual_count",
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
        "yearly_statistic": "annual_month_count",
        "caveats": ["descriptive-not-trend", "spei3-meteorological-drought"],
    },
    "wind": {
        "definition_id": "fingerprint-strong-wind-frequency-change",
        "metric": "wind.comparison.delta",
        "value_field": "delta",
        "unit": "days_per_year",
        "direction_mode": "frequency",
        "yearly_statistic": "annual_count",
        "caveats": [
            "gridded-reanalysis",
            "descriptive-not-trend",
            "not-storm-observation",
        ],
    },
}


def _direction(mode: str, value: float, qualifier: str | None = None) -> str:
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
    safe_tile = tile_id.replace("/", "-").replace(" ", "-").replace("(", "").replace(")", "")
    return f"{definition_id}:{safe_tile}:{early}_vs_{late}"


def build_signals(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    comparison = payload.get("comparison") or {}
    metrics = comparison.get("metrics") or {}
    early = comparison.get("early")
    late = comparison.get("late")
    tile_id = payload.get("tile_id")

    if not isinstance(early, str) or not isinstance(late, str):
        raise ValueError("Fingerprint payload is missing comparison periods")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("Fingerprint payload is missing tile_id")

    signals: list[dict[str, Any]] = []
    for metric_id, config in _SIGNAL_MAP.items():
        metric = metrics.get(metric_id)
        if not isinstance(metric, Mapping):
            continue
        value_field = config["value_field"]
        value = metric.get(value_field)
        if not isinstance(value, (int, float)):
            continue
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
                "direction": _direction(
                    config["direction_mode"],
                    float(value),
                    metric.get("qualifier") if isinstance(metric.get("qualifier"), str) else None,
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
                        "result_pointer": f"/data/comparison/metrics/{metric_id}/{value_field}",
                        "description": "Valeur native calculée par climate-fingerprint@4.0.0.",
                    }
                ],
                "caveat_ids": list(config["caveats"]),
                "quality_status": "valid",
                "metadata": {
                    "producer": "climate-fingerprint-service",
                    "yearly_statistic": config["yearly_statistic"],
                    "comparison_statistic": "mean",
                },
            }
        )
    return signals
