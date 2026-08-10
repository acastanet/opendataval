from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

import numpy as np

from .compute import PERIODS, ThermalSeasonsContext, ThermalSeasonsInput
from .result import ResultContext
from .science import (
    annual_durations,
    build_climatology,
    compute_thresholds,
    detect_crossings,
    fit_rmse,
    growing_season_5c,
    prepare_daily_series_with_diagnostics,
    qa_annual,
    summarize,
)
from .sensitivity import smooth_circular_moving_average, smooth_harmonic

METHOD_V2 = {"id": "thermal-seasons", "version": "2.0.0"}
REFERENCE_YEARS = range(1991, 2021)
STUDY_YEARS = range(1996, 2026)
MIN_COMPARISON_YEARS = 8
RMSE_REFERENCE_PERCENTILE = 95.0
SENSITIVITY_REVIEW_DAYS = 3.0
SENSITIVITY_REJECT_DAYS = 10.0

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
    "harmonic-season-model": "Frontières issues d'un lissage harmonique circulaire à deux harmoniques, contrôlé par une moyenne mobile circulaire de 31 jours.",
}


@dataclass(frozen=True)
class _Assessment:
    year: int
    status: str
    reasons: tuple[str, ...]
    harmonic: np.ndarray | None
    moving: np.ndarray | None
    crossings: Any | None
    moving_crossings: Any | None
    fit_rmse_c: float | None
    crossing_spread_days: float | None


def _round(value: float | None, digits: int = 2) -> float | None:
    if value is None or not np.isfinite(value):
        return None
    return round(float(value), digits)


def _decade_label(year: int) -> str | None:
    if 1996 <= year <= 2005:
        return "1996-2005"
    if 2006 <= year <= 2015:
        return "2006-2015"
    if 2016 <= year <= 2025:
        return "2016-2025"
    return None


def _crossing_spread(left: Any | None, right: Any | None) -> float | None:
    if left is None or right is None:
        return None
    fields = ("spring_start", "summer_start", "autumn_start", "winter_start")
    return float(max(abs(float(getattr(left, field)) - float(getattr(right, field))) for field in fields))


def _reference_rmse_threshold(daily_by_year: dict[int, np.ndarray]) -> tuple[float, dict[int, float]]:
    rmse_by_year: dict[int, float] = {}
    for year in REFERENCE_YEARS:
        values = daily_by_year.get(year)
        if values is None:
            continue
        smoothed = smooth_harmonic(values, harmonics=2)
        value = fit_rmse(smoothed, values)
        if np.isfinite(value):
            rmse_by_year[year] = float(value)
    if len(rmse_by_year) != len(REFERENCE_YEARS):
        missing = sorted(set(REFERENCE_YEARS) - set(rmse_by_year))
        raise ValueError(f"RMSE de référence incomplet : {missing}")
    threshold = float(np.percentile(list(rmse_by_year.values()), RMSE_REFERENCE_PERCENTILE, method="linear"))
    return threshold, rmse_by_year


def _assess_year(
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
    harmonic_crossings = detect_crossings(harmonic, t25, t75)
    moving_crossings = detect_crossings(moving, t25, t75)
    rmse = fit_rmse(harmonic, values)
    spread = _crossing_spread(harmonic_crossings, moving_crossings)

    reasons: list[str] = []
    status = "ok"

    canonical_ok, canonical_reason = qa_annual(harmonic_crossings, None)
    if not canonical_ok:
        return _Assessment(
            year,
            canonical_reason or "invalid_crossings",
            (canonical_reason or "invalid_crossings",),
            harmonic,
            moving,
            harmonic_crossings,
            moving_crossings,
            float(rmse) if np.isfinite(rmse) else None,
            spread,
        )

    if moving_crossings is None:
        status = "partial"
        reasons.append("control_crossings_unavailable")
    elif spread is not None and spread > SENSITIVITY_REJECT_DAYS:
        return _Assessment(
            year,
            "smoother_sensitivity_rejected",
            ("smoother_sensitivity_gt_10d",),
            harmonic,
            moving,
            harmonic_crossings,
            moving_crossings,
            float(rmse) if np.isfinite(rmse) else None,
            spread,
        )
    elif spread is not None and spread > SENSITIVITY_REVIEW_DAYS:
        status = "partial"
        reasons.append("smoother_sensitivity_gt_3d")

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


def _empty_entry(year: int) -> dict[str, Any]:
    return {
        "year": year,
        "status": "insufficient_data",
        "qa_reasons": [],
        "spring_start_doy": None,
        "summer_start_doy": None,
        "autumn_start_doy": None,
        "winter_start_doy": None,
        "spring_length_days": None,
        "summer_length_days": None,
        "autumn_length_days": None,
        "winter_length_days": None,
        "winter_length_status": "not_evaluated",
        "fit_rmse_c": None,
        "smoother_crossing_spread_days": None,
        "interpolated_days": 0,
        "growing_season_start_doy": None,
        "growing_season_end_doy": None,
        "growing_season_length_days": None,
    }


def _median(values: list[float]) -> float | None:
    if len(values) < MIN_COMPARISON_YEARS:
        return None
    return float(np.percentile(np.asarray(values, dtype=float), 50, method="linear"))


def _shift(entries: list[dict[str, Any]], late_entries: list[dict[str, Any]], field: str) -> float | None:
    early = _median([float(entry[field]) for entry in entries if entry.get(field) is not None])
    late = _median([float(entry[field]) for entry in late_entries if entry.get(field) is not None])
    if early is None or late is None:
        return None
    return late - early


def _quality_distribution(values: Mapping[int, float | None]) -> dict[str, Any]:
    finite = [float(value) for value in values.values() if value is not None and np.isfinite(value)]
    if not finite:
        return {"count": 0, "p25": None, "median": None, "p75": None, "p95": None, "max": None, "annual": []}
    array = np.asarray(finite, dtype=float)
    return {
        "count": int(array.size),
        "p25": _round(float(np.percentile(array, 25, method="linear")), 3),
        "median": _round(float(np.percentile(array, 50, method="linear")), 3),
        "p75": _round(float(np.percentile(array, 75, method="linear")), 3),
        "p95": _round(float(np.percentile(array, 95, method="linear")), 3),
        "max": _round(float(np.max(array)), 3),
        "annual": [
            {"year": year, "value": _round(value, 3)}
            for year, value in sorted(values.items())
            if value is not None
        ],
    }


def compute_thermal_seasons_v2_data(
    series: ThermalSeasonsInput,
    *,
    context: ThermalSeasonsContext,
) -> dict[str, Any]:
    """Calcule le candidat thermal-seasons@2.0.0 sans modifier la V1."""

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
        year: _assess_year(
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
                entry["status"] = current_reason or "invalid_crossings"
                entry["qa_reasons"] = [current_reason or "invalid_crossings"]
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
        "schema_version": "2.0",
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
            "next_year_rule": "winter length uses next-year spring only when that year's canonical crossing assessment is status=ok",
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


def build_v2_signals(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    early = _period_label(data["periods"]["early"])
    late = _period_label(data["periods"]["late"])
    tile_id = str(data["tile"]["tile_id"])
    signals: list[dict[str, Any]] = []
    for field, (definition_id, decade_metric, mode) in _SIGNAL_CONFIG.items():
        value = (data.get("comparison") or {}).get(field)
        if not isinstance(value, (int, float)):
            continue
        caveats = ["thermal-not-meteorological-season", "gridded-reanalysis", "descriptive-not-trend", "harmonic-season-model"]
        if field == "summer_length_change_days":
            caveats.append("not-heatwave-duration")
        signals.append(
            {
                "schema_version": "1.0",
                "id": f"{definition_id}:{tile_id}:{early}_vs_{late}:v2",
                "definition_id": definition_id,
                "method": deepcopy(METHOD_V2),
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
                "evidence": [{"result_pointer": f"/data/comparison/{field}", "description": "Comparaison native thermal-seasons@2.0.0."}],
                "caveat_ids": caveats,
                "quality_status": "valid",
                "metadata": {
                    "native_service": "climate-seasons-service",
                    "comparison_statistic": "median",
                    "canonical_smoothing": "harmonic_2",
                    "control_smoothing": "circular_moving_average_31d",
                },
            }
        )
    return signals


def build_climate_result_v2(
    series: ThermalSeasonsInput,
    *,
    context: ResultContext,
) -> dict[str, Any]:
    data = compute_thermal_seasons_v2_data(
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
    signals = build_v2_signals(data)
    quality = data["quality"]
    status = "valid"
    if len(signals) < 5 or quality["early_ok"] < MIN_COMPARISON_YEARS or quality["late_ok"] < MIN_COMPARISON_YEARS:
        status = "insufficient"
    elif quality["annual_partial"] or quality["annual_rejected"]:
        status = "partial"

    generated_at = context.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    caveat_ids = []
    for signal in signals:
        for caveat_id in signal["caveat_ids"]:
            if caveat_id not in caveat_ids:
                caveat_ids.append(caveat_id)

    return {
        "schema_version": "1.0",
        "result_id": f"RESULT-THERMAL-SEASONS-V2-{context.snapshot_id}",
        "snapshot_id": context.snapshot_id,
        "product": {"id": "thermal-seasons", "title": "Les saisons se déplacent"},
        "method": deepcopy(METHOD_V2),
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
                    "scope": "hourly-to-daily thermal seasons V2",
                    "rule": ">=18 hourly values/day, >=98% valid no-leap days/year, gaps <=2 days interpolated, complete 1991-2020 reference",
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
                "Candidat V2 : lissage harmonique circulaire à deux harmoniques.",
                "La moyenne mobile circulaire 31 j est un contrôle de sensibilité, pas la source du signal.",
                "Une frontière N+1 n'est utilisée pour la durée d'hiver que si sa propre QA est ok.",
            ],
        },
        "caveats": [{"id": caveat_id, "text": _CAVEATS[caveat_id], "severity": "info"} for caveat_id in caveat_ids],
        "provenance": {
            "generated_at": generated_at,
            "generated_by": "climate_seasons_service.v2",
            "method_id": METHOD_V2["id"],
            "method_version": METHOD_V2["version"],
            "snapshot_id": context.snapshot_id,
            "retrieved_at": context.retrieved_at,
        },
    }
