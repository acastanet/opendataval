from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .science import (
    annual_durations,
    build_climatology,
    compute_thresholds,
    detect_crossings,
    fit_rmse,
    growing_season_5c,
    prepare_daily_series_with_diagnostics,
    qa_annual,
    smooth_annual,
    summarize,
)

PERIODS = {
    "reference": [1991, 2020],
    "study": [1996, 2025],
    "early": [1996, 2005],
    "middle": [2006, 2015],
    "late": [2016, 2025],
}


@dataclass(frozen=True)
class ThermalSeasonsInput:
    temperature_c: pd.Series


@dataclass(frozen=True)
class ThermalSeasonsContext:
    tile_id: str
    latitude: float
    longitude: float
    grid_latitude: float | None = None
    grid_longitude: float | None = None
    retrieved_at: str | None = None
    credentials_source: str | None = None
    generated_at: str | None = None


def _empty_annual_entry(year: int) -> dict:
    return {
        "year": year,
        "status": "ok",
        "spring_start_doy": None,
        "summer_start_doy": None,
        "autumn_start_doy": None,
        "winter_start_doy": None,
        "spring_length_days": None,
        "summer_length_days": None,
        "autumn_length_days": None,
        "winter_length_days": None,
        "fit_rmse_c": None,
        "interpolated_days": 0,
        "growing_season_start_doy": None,
        "growing_season_end_doy": None,
        "growing_season_length_days": None,
    }


def _empty_document(context: ThermalSeasonsContext) -> dict:
    return {
        "schema_version": "1.0",
        "tile": {
            "tile_id": context.tile_id,
            "lat": context.latitude,
            "lon": context.longitude,
        },
        "source": {
            "dataset": "ERA5-Land",
            "variable": "2m_temperature",
            "grid_lat": context.grid_latitude,
            "grid_lon": context.grid_longitude,
            "grid_resolution_deg": 0.1,
            "native_resolution_km": 9,
            "retrieved_at": context.retrieved_at,
            "credentials_source": context.credentials_source,
        },
        "periods": PERIODS,
        "thresholds": {
            "reference_period": "1991-2020",
            "t25_c": None,
            "t75_c": None,
            "percentile_method": "linear",
        },
        "method": {
            "daily_aggregation": "hourly_mean_utc",
            "leap_day": "removed",
            "smoothing": "polynomial_degree_3",
            "crossing_interpolation": "linear",
        },
        "annual": [_empty_annual_entry(year) for year in range(1996, 2026)],
        "decades": {"1996-2005": {}, "2006-2015": {}, "2016-2025": {}},
        "comparison": {
            "spring_start_shift_days": None,
            "summer_start_shift_days": None,
            "autumn_start_shift_days": None,
            "winter_start_shift_days": None,
            "summer_length_change_days": None,
        },
        "validation": {},
        "quality": {},
    }


def _decade_label(year: int) -> str | None:
    if 1996 <= year <= 2005:
        return "1996-2005"
    if 2006 <= year <= 2015:
        return "2006-2015"
    if 2016 <= year <= 2025:
        return "2016-2025"
    return None


def _round(value) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _median(values: list[float | None]) -> float | None:
    usable = np.asarray([value for value in values if value is not None], dtype=float)
    if usable.size == 0:
        return None
    return float(np.percentile(usable, 50, method="linear"))


def _shift(early_entries: list[dict], late_entries: list[dict], field: str) -> float | None:
    early = _median([entry[field] for entry in early_entries])
    late = _median([entry[field] for entry in late_entries])
    if early is None or late is None:
        return None
    return late - early


def compute_thermal_seasons_data(
    series: ThermalSeasonsInput,
    *,
    context: ThermalSeasonsContext,
) -> dict:
    document = _empty_document(context)
    daily_by_year, daily_diagnostics = prepare_daily_series_with_diagnostics(
        series.temperature_c,
        range(1991, 2026),
    )

    missing_reference = [year for year in range(1991, 2021) if year not in daily_by_year]
    if missing_reference:
        raise ValueError(
            "Référence 1991–2020 incomplète : années insuffisamment couvertes "
            + ", ".join(str(year) for year in missing_reference)
        )

    climatology = build_climatology(daily_by_year)
    t25, t75 = compute_thresholds(climatology)
    document["thresholds"]["t25_c"] = round(t25, 3)
    document["thresholds"]["t75_c"] = round(t75, 3)

    for year in range(1996, 2026):
        entry = next(item for item in document["annual"] if item["year"] == year)
        values = daily_by_year.get(year)
        entry["interpolated_days"] = daily_diagnostics.get(year, {}).get("interpolated_days", 0)
        if values is None or bool(np.all(np.isnan(values))):
            entry["status"] = "insufficient_data"
            continue

        smoothed = smooth_annual(values)
        rmse = fit_rmse(smoothed, values)
        crossings = detect_crossings(smoothed, t25, t75)

        next_values = daily_by_year.get(year + 1)
        next_crossings = (
            detect_crossings(smooth_annual(next_values), t25, t75)
            if next_values is not None
            else None
        )
        next_spring = next_crossings.spring_start if next_crossings else None
        durations = annual_durations(crossings, next_spring) if crossings else None
        ok, reason = qa_annual(crossings, durations)

        if crossings is None or not ok:
            entry["status"] = reason or "invalid_crossings"
        else:
            entry.update(
                {
                    "spring_start_doy": round(crossings.spring_start, 2),
                    "summer_start_doy": round(crossings.summer_start, 2),
                    "autumn_start_doy": round(crossings.autumn_start, 2),
                    "winter_start_doy": round(crossings.winter_start, 2),
                    "spring_length_days": round(durations.spring_length, 2),
                    "summer_length_days": round(durations.summer_length, 2),
                    "autumn_length_days": round(durations.autumn_length, 2),
                    "winter_length_days": (
                        round(durations.winter_length, 2)
                        if durations.winter_length is not None
                        else None
                    ),
                }
            )
        entry["fit_rmse_c"] = round(float(rmse), 3)

        growing = growing_season_5c(values)
        entry["growing_season_start_doy"] = _round(growing.start)
        entry["growing_season_end_doy"] = _round(growing.end)
        entry["growing_season_length_days"] = _round(growing.length)

    for label in ("1996-2005", "2006-2015", "2016-2025"):
        entries = [
            entry
            for entry in document["annual"]
            if entry["status"] == "ok" and _decade_label(entry["year"]) == label
        ]
        if not entries:
            continue
        decade: dict[str, dict] = {}
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
            values = [entry[field] for entry in entries if entry[field] is not None]
            if values:
                decade[key] = summarize(values)
        document["decades"][label] = decade

    early = [
        entry
        for entry in document["annual"]
        if entry["status"] == "ok" and _decade_label(entry["year"]) == "1996-2005"
    ]
    late = [
        entry
        for entry in document["annual"]
        if entry["status"] == "ok" and _decade_label(entry["year"]) == "2016-2025"
    ]
    comparison = document["comparison"]
    comparison["spring_start_shift_days"] = _round(_shift(early, late, "spring_start_doy"))
    comparison["summer_start_shift_days"] = _round(_shift(early, late, "summer_start_doy"))
    comparison["autumn_start_shift_days"] = _round(_shift(early, late, "autumn_start_doy"))
    comparison["winter_start_shift_days"] = _round(_shift(early, late, "winter_start_doy"))
    comparison["summer_length_change_days"] = _round(_shift(early, late, "summer_length_days"))

    ok_years = sum(1 for entry in document["annual"] if entry["status"] == "ok")
    generated_at = context.generated_at or datetime.now(timezone.utc).isoformat()
    document["quality"] = {
        "annual_ok": ok_years,
        "annual_total": 30,
        "t25_c": round(t25, 3),
        "t75_c": round(t75, 3),
        "generated_at": generated_at,
    }

    growing_lengths = [
        entry["growing_season_length_days"]
        for entry in document["annual"]
        if entry["growing_season_length_days"] is not None
    ]
    document["validation"] = {
        "method": "copernicus_growing_season_5c",
        "growing_season_length_median_days": (
            round(float(np.median(growing_lengths)), 2) if growing_lengths else None
        ),
        "note": "Contrôle secondaire uniquement ; non affiché dans le SVG V1.",
    }
    return document
