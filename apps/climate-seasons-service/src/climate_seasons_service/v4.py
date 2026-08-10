from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Mapping

import numpy as np

from .compute import PERIODS, ThermalSeasonsContext, ThermalSeasonsInput
from .principal_regime import detect_principal_regime_crossings
from .result import ResultContext
from .science import Crossings, build_climatology, compute_thresholds, prepare_daily_series_with_diagnostics
from .sensitivity import smooth_circular_moving_average, smooth_harmonic
from .v2 import _crossing_spread, _round

METHOD_V4 = {"id": "thermal-seasons", "version": "4.0.0"}

DECADES = {
    "1996-2005": tuple(range(1996, 2006)),
    "2016-2025": tuple(range(2016, 2026)),
}
EARLY_PERIOD = "1996-2005"
LATE_PERIOD = "2016-2025"
BOOTSTRAP_REPLICATES = 1_000
BOOTSTRAP_SEED = 20260810
SENSITIVITY_ROBUST_DAYS = 5.0
SENSITIVITY_REVIEW_DAYS = 10.0

_BOUNDARY_FIELDS = ("spring_start", "summer_start", "autumn_start", "winter_start")
_BOOTSTRAP_METRIC_KEYS = {
    "spring_start": "spring_start_doy",
    "summer_start": "summer_start_doy",
    "autumn_start": "autumn_start_doy",
    "winter_start": "winter_start_doy",
    "summer_length": "summer_length_days",
}
_SIGNAL_CONFIG = {
    "spring_start_shift_days": ("thermal-spring-start-shift", "spring_start", "date_shift"),
    "summer_start_shift_days": ("thermal-summer-start-shift", "summer_start", "date_shift"),
    "autumn_start_shift_days": ("thermal-autumn-start-shift", "autumn_start", "date_shift"),
    "winter_start_shift_days": ("thermal-winter-start-shift", "winter_start", "date_shift"),
    "summer_length_change_days": ("thermal-summer-length-change", "summer_length", "length_change"),
}
_CAVEATS = {
    "thermal-not-meteorological-season": "Saison thermique locale T25/T75, pas saison fixe DJF/MAM/JJA/SON.",
    "gridded-reanalysis": "Contexte de réanalyse maillée, pas mesure sur la parcelle.",
    "descriptive-not-trend": "Comparaison descriptive entre deux climatologies décennales, sans test de tendance statistique.",
    "not-heatwave-duration": "Durée d'été thermique différente de la durée des canicules.",
    "decadal-climatology-season-model": (
        "Frontières issues de climatologies quotidiennes décennales, lissées par harmonique à deux harmoniques "
        "et contrôlées par moyenne mobile circulaire 31 jours."
    ),
}


def _climatology_for_years(daily_by_year: Mapping[int, np.ndarray], years: tuple[int, ...]) -> np.ndarray:
    missing = [year for year in years if year not in daily_by_year]
    if missing:
        raise ValueError(f"Décennie incomplète : {missing}")
    stacked = np.vstack([np.asarray(daily_by_year[year], dtype=float) for year in years])
    if not np.isfinite(stacked).any(axis=0).all():
        raise ValueError("La climatologie décennale ne couvre pas tous les jours no-leap")
    return np.nanmean(stacked, axis=0)


def _boundary_values(crossings: Crossings | None) -> dict[str, float | None]:
    if crossings is None:
        return {field: None for field in (*_BOUNDARY_FIELDS, "summer_length")}
    values = {field: _round(float(getattr(crossings, field))) for field in _BOUNDARY_FIELDS}
    values["summer_length"] = _round(float(crossings.autumn_start - crossings.summer_start))
    return values


def _spread_details(left: Crossings | None, right: Crossings | None) -> tuple[float | None, str | None]:
    if left is None or right is None:
        return None, None
    differences = {
        field: abs(float(getattr(left, field)) - float(getattr(right, field)))
        for field in _BOUNDARY_FIELDS
    }
    boundary = max(differences, key=differences.get)
    return float(differences[boundary]), boundary


def _distribution(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {"count": 0, "p05": None, "p25": None, "median": None, "p75": None, "p95": None}
    array = np.asarray(values, dtype=float)
    return {
        "count": int(array.size),
        "p05": _round(float(np.percentile(array, 5, method="linear"))),
        "p25": _round(float(np.percentile(array, 25, method="linear"))),
        "median": _round(float(np.percentile(array, 50, method="linear"))),
        "p75": _round(float(np.percentile(array, 75, method="linear"))),
        "p95": _round(float(np.percentile(array, 95, method="linear"))),
    }


def _bootstrap_record(
    daily_by_year: Mapping[int, np.ndarray],
    *,
    sampled_years: np.ndarray,
    t25: float,
    t75: float,
) -> dict[str, Any]:
    """Calcule une réplication sur des années entières avec T25/T75 fixes."""

    stacked = np.vstack([daily_by_year[int(year)] for year in sampled_years])
    if not np.isfinite(stacked).any(axis=0).all():
        return {"valid": False, "reason": "invalid_no_daily_coverage"}
    climatology = np.nanmean(stacked, axis=0)
    try:
        smoothed = smooth_harmonic(climatology, harmonics=2)
    except (FloatingPointError, ValueError):
        return {"valid": False, "reason": "invalid_smoothing"}
    if not np.isfinite(smoothed).all():
        return {"valid": False, "reason": "invalid_smoothing"}
    crossings = detect_principal_regime_crossings(smoothed, t25, t75)
    if crossings is None:
        return {"valid": False, "reason": "invalid_no_principal_regime"}
    values = _boundary_values(crossings)
    if any(values[field] is None for field in _BOUNDARY_FIELDS):
        return {"valid": False, "reason": "invalid_boundary_detection"}
    if not (
        float(values["spring_start"])
        < float(values["summer_start"])
        < float(values["autumn_start"])
        < float(values["winter_start"])
    ):
        return {"valid": False, "reason": "invalid_crossing_order"}
    return {"valid": True, "values": values}


def _summarize_period_bootstrap(records: list[dict[str, Any]]) -> dict[str, Any]:
    valid = [record for record in records if record["valid"]]
    invalid = [record for record in records if not record["valid"]]
    values = {
        field: [float(record["values"][field]) for record in valid]
        for field in (*_BOUNDARY_FIELDS, "summer_length")
    }
    total = len(records)
    return {
        "replicates_total": total,
        "replicates_valid": len(valid),
        "replicates_invalid": len(invalid),
        "invalid_rate": _round(len(invalid) / total, 6) if total else None,
        "invalid_reasons": dict(sorted(Counter(str(record["reason"]) for record in invalid).items())),
        "metrics": {_BOOTSTRAP_METRIC_KEYS[field]: _distribution(entries) for field, entries in values.items()},
    }


def _summarize_pair_bootstrap(early_records: list[dict[str, Any]], late_records: list[dict[str, Any]]) -> dict[str, Any]:
    if len(early_records) != len(late_records):
        raise ValueError("Les réplications early et late doivent être appariées")
    differences: dict[str, list[float]] = {field: [] for field in (*_BOUNDARY_FIELDS, "summer_length")}
    invalid_reasons: Counter[str] = Counter()
    for early, late in zip(early_records, late_records, strict=True):
        if not early["valid"] or not late["valid"]:
            if not early["valid"]:
                invalid_reasons[f"early:{early['reason']}"] += 1
            if not late["valid"]:
                invalid_reasons[f"late:{late['reason']}"] += 1
            continue
        for field in differences:
            differences[field].append(float(late["values"][field]) - float(early["values"][field]))
    total = len(early_records)
    valid_pairs = len(differences["summer_length"])
    summaries: dict[str, Any] = {}
    for field, values in differences.items():
        array = np.asarray(values, dtype=float)
        summary = _distribution(values)
        summary.update(
            {
                "valid_pairs": valid_pairs,
                "invalid_pairs": total - valid_pairs,
                "valid_pair_rate": _round(valid_pairs / total, 6) if total else None,
                "proportion_negative": _round(float(np.mean(array < 0.0)), 6) if array.size else None,
                "proportion_zero": _round(float(np.mean(np.isclose(array, 0.0, atol=1e-9))), 6) if array.size else None,
                "proportion_positive": _round(float(np.mean(array > 0.0)), 6) if array.size else None,
            }
        )
        summaries[f"{field}_shift_days" if field != "summer_length" else "summer_length_change_days"] = summary
    return {
        "replicates_total": total,
        "valid_pairs": valid_pairs,
        "invalid_pairs": total - valid_pairs,
        "valid_pair_rate": _round(valid_pairs / total, 6) if total else None,
        "invalid_reasons": dict(sorted(invalid_reasons.items())),
        "metrics": summaries,
    }


def _paired_bootstrap(
    daily_by_year: Mapping[int, np.ndarray],
    *,
    t25: float,
    t75: float,
    seed: int,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    rng = np.random.default_rng(seed)
    early_records: list[dict[str, Any]] = []
    late_records: list[dict[str, Any]] = []
    for _ in range(BOOTSTRAP_REPLICATES):
        early_years = rng.choice(np.asarray(DECADES[EARLY_PERIOD], dtype=int), size=10, replace=True)
        late_years = rng.choice(np.asarray(DECADES[LATE_PERIOD], dtype=int), size=10, replace=True)
        early_records.append(_bootstrap_record(daily_by_year, sampled_years=early_years, t25=t25, t75=t75))
        late_records.append(_bootstrap_record(daily_by_year, sampled_years=late_years, t25=t25, t75=t75))
    return (
        _summarize_period_bootstrap(early_records),
        _summarize_period_bootstrap(late_records),
        _summarize_pair_bootstrap(early_records, late_records),
    )


def _assess_decade(
    label: str,
    daily_by_year: Mapping[int, np.ndarray],
    *,
    t25: float,
    t75: float,
) -> dict[str, Any]:
    years = DECADES[label]
    climatology = _climatology_for_years(daily_by_year, years)
    harmonic = smooth_harmonic(climatology, harmonics=2)
    moving = smooth_circular_moving_average(climatology, window=31)
    canonical = detect_principal_regime_crossings(harmonic, t25, t75)
    control = detect_principal_regime_crossings(moving, t25, t75)
    spread, boundary = _spread_details(canonical, control)

    reasons: list[str] = []
    status = "ok"
    if canonical is None:
        status = "rejected"
        reasons.append("canonical_principal_regime_unavailable")
    elif control is None:
        status = "partial"
        reasons.append("control_principal_regime_unavailable")
    elif spread is not None and spread > SENSITIVITY_REVIEW_DAYS:
        status = "rejected"
        reasons.append("decadal_sensitivity_gt_10d")
    elif spread is not None and spread > SENSITIVITY_ROBUST_DAYS:
        status = "partial"
        reasons.append("decadal_sensitivity_gt_5d")

    return {
        "period": label,
        "years": list(years),
        "status": status,
        "qa_reasons": reasons,
        "canonical_boundaries": _boundary_values(canonical),
        "control_boundaries": _boundary_values(control),
        "sensitivity": {
            "max_boundary_difference_days": _round(spread),
            "boundary": boundary,
            "robust_threshold_days": SENSITIVITY_ROBUST_DAYS,
            "review_threshold_days": SENSITIVITY_REVIEW_DAYS,
        },
    }


def _comparison(early: Mapping[str, Any], late: Mapping[str, Any]) -> dict[str, float | None]:
    early_values = early["canonical_boundaries"]
    late_values = late["canonical_boundaries"]
    if early["status"] != "ok" or late["status"] != "ok":
        return {field: None for field in _SIGNAL_CONFIG}
    return {
        "spring_start_shift_days": _round(float(late_values["spring_start"]) - float(early_values["spring_start"])),
        "summer_start_shift_days": _round(float(late_values["summer_start"]) - float(early_values["summer_start"])),
        "autumn_start_shift_days": _round(float(late_values["autumn_start"]) - float(early_values["autumn_start"])),
        "winter_start_shift_days": _round(float(late_values["winter_start"]) - float(early_values["winter_start"])),
        "summer_length_change_days": _round(float(late_values["summer_length"]) - float(early_values["summer_length"])),
    }


def compute_thermal_seasons_v4_data(
    series: ThermalSeasonsInput,
    *,
    context: ThermalSeasonsContext,
    bootstrap_seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Calcule le candidat V4 sur deux climatologies décennales, sans modifier V1–V3."""

    daily_by_year, diagnostics = prepare_daily_series_with_diagnostics(series.temperature_c, range(1991, 2026))
    reference_years = tuple(range(1991, 2021))
    required_years = set(reference_years) | set(DECADES[EARLY_PERIOD]) | set(DECADES[LATE_PERIOD])
    missing = sorted(required_years - set(daily_by_year))
    if missing:
        raise ValueError(f"Référence ou décennie V4 incomplète : {missing}")

    reference_climatology = build_climatology(daily_by_year)
    t25, t75 = compute_thresholds(reference_climatology)
    early = _assess_decade(EARLY_PERIOD, daily_by_year, t25=t25, t75=t75)
    late = _assess_decade(LATE_PERIOD, daily_by_year, t25=t25, t75=t75)
    early_bootstrap, late_bootstrap, paired_bootstrap = _paired_bootstrap(
        daily_by_year,
        t25=t25,
        t75=t75,
        seed=bootstrap_seed,
    )
    early["bootstrap"] = early_bootstrap
    late["bootstrap"] = late_bootstrap
    comparison = _comparison(early, late)
    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    return {
        "schema_version": "4.0",
        "tile": {"tile_id": context.tile_id, "lat": context.latitude, "lon": context.longitude},
        "source": {
            "dataset": "ERA5-Land",
            "variable": "2m_temperature",
            "grid_lat": context.grid_latitude,
            "grid_lon": context.grid_longitude,
            "grid_resolution_deg": 0.1,
            "retrieved_at": context.retrieved_at,
        },
        "periods": deepcopy(PERIODS),
        "thresholds": {
            "reference_period": "1991-2020",
            "source_period": [1991, 2020],
            "scope": "common_fixed_reference",
            "recomputed_per_decade": False,
            "recomputed_per_bootstrap": False,
            "t25_c": _round(t25, 3),
            "t75_c": _round(t75, 3),
            "percentile_method": "linear",
        },
        "method": {
            "calculation_scale": "decadal_daily_climatology",
            "canonical_smoothing": "harmonic_2",
            "control_smoothing": "circular_moving_average_31d",
            "boundary_detection": "principal_interval_containing_annual_maximum",
            "crossing_interpolation": "linear",
            "daily_aggregation": "hourly_mean_utc",
            "leap_day": "removed",
            "comparison_statistic": "late_decadal_boundary_minus_early_decadal_boundary",
            "bootstrap_replicates": BOOTSTRAP_REPLICATES,
            "bootstrap_seed": bootstrap_seed,
            "bootstrap_resampling_unit": "year",
            "bootstrap_replacement": True,
        },
        "qa": {
            "smoother_sensitivity": {
                "scope": "decadal climatology principal-regime boundaries",
                "robust_threshold_days": SENSITIVITY_ROBUST_DAYS,
                "review_threshold_days": SENSITIVITY_REVIEW_DAYS,
                "action_gt_5_days": "partial_document",
                "action_gt_10_days": "rejected",
            },
            "bootstrap": {
                "scope": "canonical decadal climatology resampling of complete years",
                "interpretation": "diagnostic uncertainty; it does not determine whether the decadal curve is calculable",
                "seed": bootstrap_seed,
                "replicates": BOOTSTRAP_REPLICATES,
                "resampling_unit": "year",
                "replacement": True,
                "thresholds": {"t25_c": _round(t25, 3), "t75_c": _round(t75, 3), "scope": "common_fixed_reference"},
                "early": early_bootstrap,
                "late": late_bootstrap,
                "differences_late_minus_early": paired_bootstrap,
                "invalid_rate_early": early_bootstrap["invalid_rate"],
                "invalid_rate_late": late_bootstrap["invalid_rate"],
                "valid_pair_rate": paired_bootstrap["valid_pair_rate"],
            },
            "next_year_rule": "not_applicable: V4 winter duration is not computed from annual N+1 boundaries",
        },
        "decades": {EARLY_PERIOD: early, LATE_PERIOD: late},
        "comparison": comparison,
        "quality": {
            "early_status": early["status"],
            "late_status": late["status"],
            "decades_ok": int(early["status"] == "ok") + int(late["status"] == "ok"),
            "comparison_available": all(value is not None for value in comparison.values()),
            "generated_at": generated_at,
        },
        "input_diagnostics": {str(year): diagnostics[year] for year in sorted(required_years)},
    }


def _direction(mode: str, value: float) -> str:
    if value == 0:
        return "stable"
    if mode == "date_shift":
        return "earlier" if value < 0 else "later"
    return "longer" if value > 0 else "shorter"


def build_v4_signals(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    early = data["decades"][EARLY_PERIOD]
    late = data["decades"][LATE_PERIOD]
    tile_id = str(data["tile"]["tile_id"])
    signals: list[dict[str, Any]] = []
    for field, (definition_id, boundary, mode) in _SIGNAL_CONFIG.items():
        value = data["comparison"].get(field)
        if not isinstance(value, (int, float)):
            continue
        caveats = [
            "thermal-not-meteorological-season",
            "gridded-reanalysis",
            "descriptive-not-trend",
            "decadal-climatology-season-model",
        ]
        if field == "summer_length_change_days":
            caveats.append("not-heatwave-duration")
        signals.append(
            {
                "schema_version": "1.0",
                "id": f"{definition_id}:{tile_id}:{EARLY_PERIOD}_vs_{LATE_PERIOD}:v4",
                "definition_id": definition_id,
                "method": deepcopy(METHOD_V4),
                "metric": field,
                "claim_level": "descriptive",
                "value": float(value),
                "unit": "days",
                "direction": _direction(mode, float(value)),
                "comparison": {
                    "early_period": EARLY_PERIOD,
                    "late_period": LATE_PERIOD,
                    "early_value": early["canonical_boundaries"].get(boundary),
                    "late_value": late["canonical_boundaries"].get(boundary),
                    "delta": float(value),
                    "relative_pct": None,
                },
                "evidence": [{"result_pointer": f"/data/comparison/{field}", "description": "Comparaison native thermal-seasons@4.0.0."}],
                "caveat_ids": caveats,
                "quality_status": "valid",
                "metadata": {
                    "native_service": "climate-seasons-service",
                    "calculation_scale": "decadal_daily_climatology",
                    "canonical_smoothing": "harmonic_2",
                    "control_smoothing": "circular_moving_average_31d",
                    "boundary_detection": "principal_interval_containing_annual_maximum",
                },
            }
        )
    return signals


def build_climate_result_v4(series: ThermalSeasonsInput, *, context: ResultContext) -> dict[str, Any]:
    data = compute_thermal_seasons_v4_data(
        series,
        context=ThermalSeasonsContext(
            tile_id=context.tile_id,
            latitude=context.latitude,
            longitude=context.longitude,
            grid_latitude=context.grid_latitude,
            grid_longitude=context.grid_longitude,
            retrieved_at=context.retrieved_at,
            credentials_source=None,
            generated_at=context.generated_at,
        ),
    )
    signals = build_v4_signals(data)
    quality = data["quality"]
    status = "valid" if quality["comparison_available"] and len(signals) == 5 else "insufficient"
    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal["caveat_ids"]:
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)
    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    return {
        "schema_version": "1.0",
        "result_id": f"RESULT-THERMAL-SEASONS-V4-{context.snapshot_id}",
        "snapshot_id": context.snapshot_id,
        "product": {"id": "thermal-seasons", "title": "Les saisons se déplacent"},
        "method": deepcopy(METHOD_V4),
        "location": {
            "requested": {"geometry": {"type": "Point", "coordinates": [context.longitude, context.latitude]}, "label": context.tile_id, "tile_id": context.tile_id},
            "represented": {"grid_point": {"lat": context.grid_latitude, "lon": context.grid_longitude}, "grid_resolution_deg": 0.1},
        },
        "periods": deepcopy(data["periods"]),
        "datasets": [{"registry_id": "era5-land-timeseries", "dataset_id": "reanalysis-era5-land-timeseries", "variables": ["2m_temperature"], "grid_degrees": 0.1}],
        "representativity": {
            "type": "gridded_reanalysis",
            "local_measurement": False,
            "requested_point": {"lat": context.latitude, "lon": context.longitude},
            "represented_grid_point": {"lat": context.grid_latitude, "lon": context.grid_longitude},
            "grid_resolution_deg": 0.1,
        },
        "data": data,
        "signals": signals,
        "quality": {
            "status": status,
            "checks": [
                {"id": "completeness-policy", "status": "pass", "scope": "complete daily no-leap years for common reference and two decadal climatologies"},
                {"id": "decadal-smoother-sensitivity", "status": "pass" if quality["decades_ok"] == 2 else "partial", "robust_threshold_days": SENSITIVITY_ROBUST_DAYS, "review_threshold_days": SENSITIVITY_REVIEW_DAYS},
                {"id": "five-comparison-signals", "status": "pass" if len(signals) == 5 else "partial", "count": len(signals)},
            ],
            "notes": [
                "Candidat V4 : les saisons sont déterminées sur les climatologies journalières de deux décennies, avec seuils communs 1991–2020.",
                "Le bootstrap des années est un diagnostic d'incertitude et ne qualifie pas à lui seul une décennie.",
                "La durée d'été est calculée sur la même courbe décennale : début d'automne moins début d'été.",
            ],
        },
        "caveats": [{"id": caveat_id, "text": _CAVEATS[caveat_id], "severity": "info"} for caveat_id in caveat_ids],
        "provenance": {"generated_at": generated_at, "generated_by": "climate_seasons_service.v4", "method_id": METHOD_V4["id"], "method_version": METHOD_V4["version"], "snapshot_id": context.snapshot_id, "retrieved_at": context.retrieved_at},
    }
