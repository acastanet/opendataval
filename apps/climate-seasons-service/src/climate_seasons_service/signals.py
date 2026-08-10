from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

METHOD = {"id": "thermal-seasons", "version": "1.0.0"}

_SIGNAL_CONFIG = {
    "spring_start_shift_days": (
        "thermal-spring-start-shift",
        "spring_start",
        "date_shift",
        ["thermal-not-meteorological-season", "gridded-reanalysis", "descriptive-not-trend"],
    ),
    "summer_start_shift_days": (
        "thermal-summer-start-shift",
        "summer_start",
        "date_shift",
        ["thermal-not-meteorological-season", "gridded-reanalysis", "descriptive-not-trend"],
    ),
    "autumn_start_shift_days": (
        "thermal-autumn-start-shift",
        "autumn_start",
        "date_shift",
        ["thermal-not-meteorological-season", "gridded-reanalysis", "descriptive-not-trend"],
    ),
    "winter_start_shift_days": (
        "thermal-winter-start-shift",
        "winter_start",
        "date_shift",
        ["thermal-not-meteorological-season", "gridded-reanalysis", "descriptive-not-trend"],
    ),
    "summer_length_change_days": (
        "thermal-summer-length-change",
        "summer_length",
        "length_change",
        ["thermal-not-meteorological-season", "descriptive-not-trend", "not-heatwave-duration"],
    ),
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


def _median(decades: Mapping[str, Any], period: str, metric: str) -> float | None:
    block = decades.get(period)
    if not isinstance(block, Mapping):
        return None
    metric_block = block.get(metric)
    if not isinstance(metric_block, Mapping):
        return None
    value = metric_block.get("median")
    return float(value) if isinstance(value, (int, float)) else None


def build_signals(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    periods = data.get("periods") or {}
    early = _period_label(periods.get("early"))
    late = _period_label(periods.get("late"))
    tile = data.get("tile") or {}
    tile_id = tile.get("tile_id")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("tile.tile_id manquant")
    comparison = data.get("comparison") or {}
    decades = data.get("decades") or {}

    signals: list[dict[str, Any]] = []
    for field, (definition_id, decade_metric, mode, caveat_ids) in _SIGNAL_CONFIG.items():
        value = comparison.get(field)
        if not isinstance(value, (int, float)):
            raise ValueError(f"comparison.{field} doit être numérique")
        signals.append(
            {
                "schema_version": "1.0",
                "id": f"{definition_id}:{tile_id}:{early}_vs_{late}",
                "definition_id": definition_id,
                "method": deepcopy(METHOD),
                "metric": field,
                "claim_level": "descriptive",
                "value": float(value),
                "unit": "days",
                "direction": _direction(mode, float(value)),
                "comparison": {
                    "early_period": early,
                    "late_period": late,
                    "early_value": _median(decades, early, decade_metric),
                    "late_value": _median(decades, late, decade_metric),
                    "delta": float(value),
                    "relative_pct": None,
                },
                "evidence": [
                    {
                        "result_pointer": f"/data/comparison/{field}",
                        "description": "Comparaison native des médianes décennales selon thermal-seasons@1.0.0.",
                    }
                ],
                "caveat_ids": list(caveat_ids),
                "quality_status": "valid",
                "metadata": {
                    "native_service": "climate-seasons-service",
                    "comparison_statistic": "median",
                },
            }
        )
    return signals
