from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Mapping

import numpy as np

from .compute import PERIODS, ThermalSeasonsContext, ThermalSeasonsInput
from .principal_regime import detect_principal_regime_crossings
from .result import ResultContext
from .science import (
    annual_durations,
    build_climatology,
    compute_thresholds,
    fit_rmse,
    growing_season_5c,
    prepare_daily_series_with_diagnostics,
    qa_annual,
    summarize,
)
from .sensitivity import smooth_circular_moving_average, smooth_harmonic
from .v2 import (
    MIN_COMPARISON_YEARS,
    REFERENCE_YEARS,
    RMSE_REFERENCE_PERCENTILE,
    SENSITIVITY_REJECT_DAYS,
    SENSITIVITY_REVIEW_DAYS,
    STUDY_YEARS,
    _Assessment,
    _crossing_spread,
    _decade_label,
    _empty_entry,
    _quality_distribution,
    _reference_rmse_threshold,
    _round,
    _shift,
)

METHOD_V3 = {"id": "thermal-seasons", "version": "3.0.0"}

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
    "descriptive-not-trend": "Comparaison descriptive sans test de tendance statistique.",
    "not-heatwave-duration": "Durée d'été thermique différente de la durée des canicules.",
    "principal-regime-season-model": (
        "Frontières issues de l'intervalle thermique principal T25/T75 contenant le maximum annuel ; "
        "lissage harmonique à deux harmoniques contrôlé par moyenne mobile circulaire 31 jours."
    ),
}


def _assess_year_v3(
    year: int,
    values: np.ndarray | None,
    *,
    t25: float,
    t75: float,
    rmse_threshold: float,
) -> _Assessment:
    if values is None or bool(np.all(np.isnan(values))):
        return _Assessment(year, "insufficient_data", ("insufficient_data",), None, None, None, None, None, None)

    harmonic = smooth_harmonic(values, harmonics=2)
    moving = smooth_circular_moving_average(values, window=31)
    harmonic_crossings = detect_principal_regime_crossings(harmonic, t25, t75)
    moving_crossings = detect_principal_regime_crossings(moving, t25, t75)
    rmse = fit_rmse(harmonic, values)
    spread = _crossing_spread(harmonic_crossings, moving_crossings)

    canonical_ok, canonical_reason = qa_annual(harmonic_crossings, None)
    if not canonical_ok:
        return _Assessment(
            year,
            canonical_reason or "invalid_principal_regime",
            (canonical_reason or "invalid_principal_regime",),
            harmonic,
            moving,
            harmonic_crossings,
            moving_crossings,
            float(rmse) if np.isfinite(rmse) else None,
            spread,
        )

    reasons: list[str] = []
    status = "ok"
    if moving_crossings is None:
        status = "partial"
        reasons.append("control_principal_regime_unavailable")
    elif spread is not None and spread > SENSITIVITY_REJECT_DAYS:
        return _Assessment(
            year,
            "smoother_sensitivity_rejected",
            ("principal_regime_sensitivity_gt_10d",),
            harmonic,
            moving,
            harmonic_crossings,
            moving_crossings,
            float(rmse) if np.isfinite(rmse) else None,
            spread,
        )
    elif spread is not None and spread > SENSITIVITY_REVIEW_DAYS:
        status = "partial"
        reasons.append("principal_regime_sensitivity_gt_3d")

    if not np.isfinite(rmse):
        status = "partial"
        reasons.append("fit_rmse_unavailable")
    elif float(rmse) > rmse_threshold + 1e-9:
        status = "partial"
        reasons.append("fit_rmse_above_reference_p95")

    return _Assessment(
        year,
        status,
        tuple(reasons),
        harmonic,
        moving,
        harmonic_crossings,
        moving_crossings,
        float(rmse) if np.isfinite(rmse) else None,
        spread,
    )


def compute_thermal_seasons_v3_data(
    series: ThermalSeasonsInput,
    *,
    context: ThermalSeasonsContext,
) -> dict[str, Any]:
    """Calcule le candidat thermal-seasons@3.0.0 sans modifier V1 ni V2."""

    daily_by_year, diagnostics = prepare_daily_series_with_diagnostics(series.temperature_c, range(1991, 2026))
    missing_reference = [year for year in REFERENCE_YEARS if year not in daily_by_year]
    if missing_reference:
        raise ValueError(
            "Référence 1991–2020 incomplète : années insuffisamment couvertes "
            + ", ".join(str(year) for year in missing_reference)
        )

    climatology = build_climatology(daily_by_year)
    t25, t75 = compute_thresholds(climatology)
    rmse_threshold, reference_rmse = _reference_rmse_threshold(daily_by_year)

    assessments = {
        year: _assess_year_v3(
            year,
            daily_by_year.get(year),
            t25=t25,
            t75=t75,
            rmse_threshold=rmse_threshold,
        )
        for year in range(1991, 2026)
    }

    annual: list[dict[str, Any]] = []
    for year in STUDY_YEARS:
        assessment = assessments[year]
        entry = _empty_entry(year)
        entry["status"] = assessment.status
        entry["qa_reasons"] = list(assessment.reasons)
        entry["interpolated_days"] = diagnostics.get(year, {}).get("interpolated_days", 0)
        entry["fit_rmse_c"] = _round(assessment.fit_rmse_c, 3)
        entry["smoother_crossing_spread_days"] = _round(assessment.crossing_spread_days, 2)

        crossings = assessment.crossings
        if crossings is not None:
            next_assessment = assessments.get(year + 1)
            next_spring = (
                float(next_assessment.crossings.spring_start)
                if next_assessment is not None
                and next_assessment.status == "ok"
                and next_assessment.crossings is not None
                else None
            )
            durations = annual_durations(crossings, next_spring)
            current_ok, current_reason = qa_annual(crossings, durations)
            if not current_ok:
                entry["status"] = current_reason or "invalid_principal_regime"
                entry["qa_reasons"] = [current_reason or "invalid_principal_regime"]
            else:
                entry.update(
                    {
                        "spring_start_doy": _round(float(crossings.spring_start)),
                        "summer_start_doy": _round(float(crossings.summer_start)),
                        "autumn_start_doy": _round(float(crossings.autumn_start)),
                        "winter_start_doy": _round(float(crossings.winter_start)),
                        "spring_length_days": _round(durations.spring_length),
                        "summer_length_days": _round(durations.summer_length),
                        "autumn_length_days": _round(durations.autumn_length),
                        "winter_length_days": _round(durations.winter_length),
                        "winter_length_status": "ok" if next_spring is not None else "next_year_spring_not_qa_validated",
                    }
                )

        values = daily_by_year.get(year)
        if values is not None:
            growing = growing_season_5c(values)
            entry["growing_season_start_doy"] = _round(growing.start)
            entry["growing_season_end_doy"] = _round(growing.end)
            entry["growing_season_length_days"] = _round(growing.length)
        annual.append(entry)

    decades: dict[str, dict[str, Any]] = {key: {} for key in ("1996-2005", "2006-2015", "2016-2025")}
    for label in decades:
        entries = [entry for entry in annual if entry["status"] == "ok" and _decade_label(entry["year"]) == label]
        for key, field in (
            ("spring_start", "spring_start_doy"),
            ("summer_start", "summer_start_doy"),
            ("autumn_start", "autumn_start_doy"),
            ("winter_start", "winter_start_doy"),
            ("spring_length", "spring_length_days"),
            ("summer_length", "summer_length_days"),
            ("autumn_length", "autumn_length_days"),
            ("winter_length", "winter_length_days"),
        ):
            values = [entry[field] for entry in entries if entry.get(field) is not None]
            if values:
                decades[label][key] = summarize(values)

    early_entries = [entry for entry in annual if entry["status"] == "ok" and _decade_label(entry["year"]) == "1996-2005"]
    late_entries = [entry for entry in annual if entry["status"] == "ok" and _decade_label(entry["year"]) == "2016-2025"]
    comparison = {
        "spring_start_shift_days": _round(_shift(early_entries, late_entries, "spring_start_doy")),
        "summer_start_shift_days": _round(_shift(early_entries, late_entries, "summer_start_doy")),
        "autumn_start_shift_days": _round(_shift(early_entries, late_entries, "autumn_start_doy")),
        "winter_start_shift_days": _round(_shift(early_entries, late_entries, "winter_start_doy")),
        "summer_length_change_days": _round(_shift(early_entries, late_entries, "summer_length_days")),
    }

    rmse_values = {entry["year"]: entry["fit_rmse_c"] for entry in annual}
    spread_values = {entry["year"]: entry["smoother_crossing_spread_days"] for entry in annual}
    ok_count = sum(entry["status"] == "ok" for entry in annual)
    partial_count = sum(entry["status"] == "partial" for entry in annual)
    rejected_count = len(annual) - ok_count - partial_count

    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": "3.0",
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
            "t25_c": _round(t25, 3),
            "t75_c": _round(t75, 3),
            "percentile_method": "linear",
        },
        "method": {
            "canonical_smoothing": "harmonic_2",
            "control_smoothing": "circular_moving_average_31d",
            "boundary_detection": "principal_interval_containing_annual_maximum",
            "crossing_interpolation": "linear",
            "daily_aggregation": "hourly_mean_utc",
            "leap_day": "removed",
            "comparison_statistic": "median",
            "minimum_comparison_years_per_decade": MIN_COMPARISON_YEARS,
        },
        "qa": {
            "fit_rmse": {
                "reference_percentile": RMSE_REFERENCE_PERCENTILE,
                "threshold_c": _round(rmse_threshold, 3),
                "reference_distribution": _quality_distribution(reference_rmse),
                "study_distribution": _quality_distribution(rmse_values),
            },
            "smoother_sensitivity": {
                "review_threshold_days": SENSITIVITY_REVIEW_DAYS,
                "reject_threshold_days": SENSITIVITY_REJECT_DAYS,
                "study_distribution": _quality_distribution(spread_values),
            },
            "next_year_rule": "winter length uses next-year spring only when that year's V3 principal-regime assessment is status=ok",
        },
        "annual": annual,
        "decades": decades,
        "comparison": comparison,
        "quality": {
            "annual_ok": ok_count,
            "annual_partial": partial_count,
            "annual_rejected": rejected_count,
            "annual_total": len(annual),
            "early_ok": len(early_entries),
            "late_ok": len(late_entries),
            "generated_at": generated_at,
        },
    }


def _direction(mode: str, value: float) -> str:
    if value == 0:
        return "stable"
    if mode == "date_shift":
        return "earlier" if value < 0 else "later"
    return "longer" if value > 0 else "shorter"


def _period_label(period: list[int]) -> str:
    return f"{period[0]}-{period[1]}"


def _decade_median(data: Mapping[str, Any], period: str, metric: str) -> float | None:
    block = (data.get("decades") or {}).get(period)
    if not isinstance(block, Mapping):
        return None
    metric_block = block.get(metric)
    if not isinstance(metric_block, Mapping):
        return None
    value = metric_block.get("median")
    return float(value) if isinstance(value, (int, float)) else None


def build_v3_signals(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    early = _period_label(data["periods"]["early"])
    late = _period_label(data["periods"]["late"])
    tile_id = str(data["tile"]["tile_id"])
    signals: list[dict[str, Any]] = []
    for field, (definition_id, decade_metric, mode) in _SIGNAL_CONFIG.items():
        value = (data.get("comparison") or {}).get(field)
        if not isinstance(value, (int, float)):
            continue
        caveats = [
            "thermal-not-meteorological-season",
            "gridded-reanalysis",
            "descriptive-not-trend",
            "principal-regime-season-model",
        ]
        if field == "summer_length_change_days":
            caveats.append("not-heatwave-duration")
        signals.append(
            {
                "schema_version": "1.0",
                "id": f"{definition_id}:{tile_id}:{early}_vs_{late}:v3",
                "definition_id": definition_id,
                "method": deepcopy(METHOD_V3),
                "metric": field,
                "claim_level": "descriptive",
                "value": float(value),
                "unit": "days",
                "direction": _direction(mode, float(value)),
                "comparison": {
                    "early_period": early,
                    "late_period": late,
                    "early_value": _decade_median(data, early, decade_metric),
                    "late_value": _decade_median(data, late, decade_metric),
                    "delta": float(value),
                    "relative_pct": None,
                },
                "evidence": [{"result_pointer": f"/data/comparison/{field}", "description": "Comparaison native thermal-seasons@3.0.0."}],
                "caveat_ids": caveats,
                "quality_status": "valid",
                "metadata": {
                    "native_service": "climate-seasons-service",
                    "comparison_statistic": "median",
                    "canonical_smoothing": "harmonic_2",
                    "control_smoothing": "circular_moving_average_31d",
                    "boundary_detection": "principal_interval_containing_annual_maximum",
                },
            }
        )
    return signals


def build_climate_result_v3(
    series: ThermalSeasonsInput,
    *,
    context: ResultContext,
) -> dict[str, Any]:
    data = compute_thermal_seasons_v3_data(
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
    signals = build_v3_signals(data)
    quality = data["quality"]
    status = "valid"
    if len(signals) < 5 or quality["early_ok"] < MIN_COMPARISON_YEARS or quality["late_ok"] < MIN_COMPARISON_YEARS:
        status = "insufficient"
    elif quality["annual_partial"] or quality["annual_rejected"]:
        status = "partial"

    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    caveat_ids: list[str] = []
    for signal in signals:
        for caveat_id in signal["caveat_ids"]:
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)

    return {
        "schema_version": "1.0",
        "result_id": f"RESULT-THERMAL-SEASONS-V3-{context.snapshot_id}",
        "snapshot_id": context.snapshot_id,
        "product": {"id": "thermal-seasons", "title": "Les saisons se déplacent"},
        "method": deepcopy(METHOD_V3),
        "location": {
            "requested": {
                "geometry": {"type": "Point", "coordinates": [context.longitude, context.latitude]},
                "label": context.tile_id,
                "tile_id": context.tile_id,
            },
            "represented": {
                "grid_point": {"lat": context.grid_latitude, "lon": context.grid_longitude},
                "grid_resolution_deg": 0.1,
            },
        },
        "periods": deepcopy(data["periods"]),
        "datasets": [
            {
                "registry_id": "era5-land-timeseries",
                "dataset_id": "reanalysis-era5-land-timeseries",
                "variables": ["2m_temperature"],
                "grid_degrees": 0.1,
            }
        ],
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
                {
                    "id": "completeness-policy",
                    "status": "pass",
                    "scope": "hourly-to-daily thermal seasons V3",
                    "rule": ">=18 hourly values/day, >=98% valid no-leap days/year, gaps <=2 days interpolated, complete 1991-2020 reference",
                },
                {
                    "id": "principal-regime-boundaries",
                    "status": "pass" if quality["annual_rejected"] == 0 else "partial",
                    "rule": "T25/T75 intervals must contain the annual thermal maximum and preserve spring < summer < autumn < winter",
                },
                {
                    "id": "fit-rmse",
                    "status": "pass" if quality["annual_partial"] == 0 else "partial",
                    "threshold_policy": "reference annual harmonic RMSE P95",
                    "threshold_c": data["qa"]["fit_rmse"]["threshold_c"],
                },
                {
                    "id": "smoother-sensitivity",
                    "status": "pass" if quality["annual_rejected"] == 0 else "partial",
                    "review_threshold_days": SENSITIVITY_REVIEW_DAYS,
                    "reject_threshold_days": SENSITIVITY_REJECT_DAYS,
                },
                {
                    "id": "five-comparison-signals",
                    "status": "pass" if len(signals) == 5 else "partial",
                    "count": len(signals),
                },
            ],
            "notes": [
                "Candidat V3 : les frontières T25/T75 sont les limites des régimes chauds contenant le maximum thermique annuel.",
                "Le lissage harmonique reste canonique ; la moyenne mobile circulaire 31 j reste un contrôle indépendant.",
                "Une frontière N+1 n'est utilisée pour la durée d'hiver que si sa propre QA V3 est ok.",
            ],
        },
        "caveats": [{"id": caveat_id, "text": _CAVEATS[caveat_id], "severity": "info"} for caveat_id in caveat_ids],
        "provenance": {
            "generated_at": generated_at,
            "generated_by": "climate_seasons_service.v3",
            "method_id": METHOD_V3["id"],
            "method_version": METHOD_V3["version"],
            "snapshot_id": context.snapshot_id,
            "retrieved_at": context.retrieved_at,
        },
    }
