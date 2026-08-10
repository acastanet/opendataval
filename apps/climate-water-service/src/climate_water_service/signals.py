from __future__ import annotations

from typing import Any, Mapping

METHOD = {"id": "water-through-year", "version": "1.0.0"}

_CONFIG = {
    "annual_precip_change_pct": {
        "definition_id": "water-annual-precipitation-change",
        "unit": "percent",
        "mode": "higher_lower",
        "caveats": ["gridded-reanalysis", "descriptive-not-trend", "not-water-resource"],
    },
    "summer_soil_water_change_mm": {
        "definition_id": "water-summer-soil-water-change",
        "unit": "mm_modelled_water_equivalent",
        "mode": "higher_lower",
        "caveats": ["modelled-soil-water-not-reserve-utile", "gridded-reanalysis", "descriptive-not-trend"],
    },
    "dry_months_change": {
        "definition_id": "water-dry-months-change",
        "unit": "months_per_year",
        "mode": "frequency",
        "caveats": ["spei3-meteorological-drought", "descriptive-not-trend"],
    },
}


def _period(value: object) -> str:
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("Période invalide")
    return f"{value[0]}-{value[1]}"


def _direction(mode: str, value: float) -> str:
    if value == 0:
        return "stable"
    if mode == "higher_lower":
        return "higher" if value > 0 else "lower"
    return "more_frequent" if value > 0 else "less_frequent"


def build_signals(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    tile = data.get("tile") or {}
    tile_id = tile.get("tile_id")
    if not isinstance(tile_id, str) or not tile_id:
        raise ValueError("tile.tile_id manquant")
    periods = data.get("periods") or {}
    early, late = _period(periods.get("early")), _period(periods.get("late"))
    comparison = data.get("comparison") or {}
    signals: list[dict[str, Any]] = []
    for field, config in _CONFIG.items():
        value = comparison.get(field)
        if not isinstance(value, (int, float)):
            continue
        safe_tile = tile_id.replace("/", "-").replace(" ", "-")
        signals.append({
            "schema_version": "1.0",
            "id": f"{config['definition_id']}:{safe_tile}:{early}_vs_{late}",
            "definition_id": config["definition_id"],
            "method": dict(METHOD),
            "metric": field,
            "claim_level": "descriptive",
            "value": value,
            "unit": config["unit"],
            "direction": _direction(config["mode"], float(value)),
            "comparison": {
                "early_period": early,
                "late_period": late,
                "early_value": None,
                "late_value": None,
                "delta": value,
                "relative_pct": value if field == "annual_precip_change_pct" else None,
            },
            "evidence": [{
                "result_pointer": f"/data/comparison/{field}",
                "description": "Valeur de comparaison calculée par climate-water-service.",
            }],
            "caveat_ids": list(config["caveats"]),
            "quality_status": "valid",
            "metadata": {"producer": "climate-water-service"},
        })
    return signals
