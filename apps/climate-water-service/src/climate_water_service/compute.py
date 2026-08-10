from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .science import prepare_land_monthly_mean, prepare_spei3_monthly, reference_percentile, summarize

MONTH_KEYS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
PERIODS = {
    "reference": [1991, 2020],
    "study": [1996, 2025],
    "early": [1996, 2005],
    "middle": [2006, 2015],
    "late": [2016, 2025],
}
_DECADES = {
    "1996-2005": range(1996, 2006),
    "2006-2015": range(2006, 2016),
    "2016-2025": range(2016, 2026),
}
METRICS = ("precipitation_mm", "soil_water_0_100_mm", "actual_evapotranspiration_mm", "spei3")


@dataclass(frozen=True)
class WaterThroughYearInput:
    era5_land_monthly: pd.DataFrame
    spei3: pd.Series


@dataclass(frozen=True)
class WaterContext:
    tile_id: str
    latitude: float
    longitude: float
    land_grid_latitude: float | None = None
    land_grid_longitude: float | None = None
    drought_grid_latitude: float | None = None
    drought_grid_longitude: float | None = None
    dataset_version: str | None = None
    retrieved_at: str | None = None
    generated_at: str | None = None


def _empty_month() -> dict:
    result: dict[str, object] = {}
    for metric in METRICS:
        result.update({f"{metric}_p25": None, f"{metric}_median": None, f"{metric}_p75": None})
    result.update({
        "soil_water_reference_percentile_p25": None,
        "soil_water_reference_percentile_median": None,
        "soil_water_reference_percentile_p75": None,
        "soil_water_layer_1_m3m3_median": None,
        "runoff_mm_median": None,
        "surface_runoff_mm_median": None,
        "sub_surface_runoff_mm_median": None,
        "snowfall_mm_we_median": None,
        "snowmelt_mm_we_median": None,
        "snow_depth_water_equivalent_mm_median": None,
        "valid_years": 0,
        "status": "missing",
    })
    return result


def _empty_document(context: WaterContext) -> dict:
    return {
        "schema_version": "1.0",
        "tile": {"tile_id": context.tile_id, "lat": context.latitude, "lon": context.longitude},
        "representativity": {
            "grid_lat": context.land_grid_latitude,
            "grid_lon": context.land_grid_longitude,
            "grid_resolution_deg": 0.1,
            "native_resolution_km": 9,
            "site_altitude_m": None,
            "model_orography_m": None,
            "altitude_difference_m": None,
        },
        "periods": PERIODS,
        "sources": {
            "precipitation": "ERA5-Land",
            "soil_water": "ERA5-Land",
            "actual_evapotranspiration": "ERA5-Land",
            "spei3": "ERA5-Drought",
            "dataset_version": context.dataset_version,
            "retrieved_at": context.retrieved_at,
        },
        "method": {
            "precipitation": "somme mensuelle, m vers mm",
            "soil_water_0_100": "1000 × (0.07 × θ1 + 0.21 × θ2 + 0.72 × θ3), moyenne mensuelle",
            "actual_evapotranspiration": "somme mensuelle de -total_evaporation, m vers mm",
            "decadal_statistics": "percentiles linéaires P25, médiane, P75",
            "reference": "distribution mensuelle 1991-2020",
        },
        "monthly": {label: {month: _empty_month() for month in MONTH_KEYS} for label in _DECADES},
        "reference_monthly": {month: _empty_month() for month in MONTH_KEYS},
        "comparison": {
            "annual_precip_change_pct": None,
            "summer_soil_water_change_mm": None,
            "dry_months_change": None,
            "dry_months_definition": "nombre moyen de mois par an avec SPEI-3 < -1,0 ; tardif moins précoce",
        },
        "quality": {"variables": {}, "monthly_completeness": {}, "generated_at": None},
    }


def _finite(values: pd.Series) -> list[float]:
    return [float(v) for v in values.dropna().tolist() if np.isfinite(v)]


def _set_statistics(target: dict, metric: str, values: pd.Series) -> None:
    for statistic, value in summarize(_finite(values)).items():
        target[f"{metric}_{statistic}"] = value


def _quality(monthly: pd.DataFrame, spei: pd.DataFrame) -> dict[str, dict[str, object]]:
    variables: dict[str, dict[str, object]] = {}
    for column in ("precipitation_mm", "soil_water_0_100_mm", "actual_evapotranspiration_mm"):
        valid = int(monthly.loc[(monthly.year >= 1991) & (monthly.year <= 2025), column].notna().sum())
        variables[column] = {"valid_months": valid, "expected_months": 420, "status": "ok" if valid == 420 else "incomplete"}
    spei_valid = int(spei.loc[(spei.year >= 1991) & (spei.year <= 2025), "spei3"].notna().sum()) if not spei.empty else 0
    variables["spei3"] = {"valid_months": spei_valid, "expected_months": 420, "status": "ok" if spei_valid == 420 else "incomplete"}
    return variables


def compute_water_through_year_data(series: WaterThroughYearInput, *, context: WaterContext) -> dict:
    document = _empty_document(context)
    prepared = prepare_land_monthly_mean(series.era5_land_monthly)
    land = prepared.copy()
    land["year"] = land.index.year
    land["month"] = land.index.month
    land["expected_days"] = land.index.days_in_month
    drought = prepare_spei3_monthly(series.spei3)
    monthly = land.merge(drought, on=["year", "month"], how="outer")
    monthly = monthly.loc[(monthly.year >= 1991) & (monthly.year <= 2025)].copy()
    if monthly.empty:
        raise ValueError("Aucune donnée ERA5-Land mensuelle exploitable.")

    reference = monthly.loc[(monthly.year >= 1991) & (monthly.year <= 2020)].copy()
    monthly["soil_water_reference_percentile"] = np.nan
    for month in range(1, 13):
        ref_values = _finite(reference.loc[reference.month == month, "soil_water_0_100_mm"])
        mask = monthly.month == month
        monthly.loc[mask, "soil_water_reference_percentile"] = monthly.loc[mask, "soil_water_0_100_mm"].map(
            lambda value: reference_percentile(value, ref_values)
        )
        target = document["reference_monthly"][MONTH_KEYS[month - 1]]
        selection = reference.loc[reference.month == month]
        for metric in METRICS:
            _set_statistics(target, metric, selection[metric] if metric in selection else pd.Series(dtype=float))
        _set_statistics(target, "soil_water_reference_percentile", monthly.loc[
            (monthly.month == month) & (monthly.year >= 1991) & (monthly.year <= 2020),
            "soil_water_reference_percentile",
        ])
        target["valid_years"] = int(selection.soil_water_0_100_mm.notna().sum())
        target["status"] = "ok" if target["valid_years"] else "missing"

    for label, years in _DECADES.items():
        decadal = monthly.loc[monthly.year.isin(years)]
        for month in range(1, 13):
            target = document["monthly"][label][MONTH_KEYS[month - 1]]
            selection = decadal.loc[decadal.month == month]
            for metric in (*METRICS, "soil_water_reference_percentile", "soil_water_layer_1_m3m3"):
                if metric in selection:
                    _set_statistics(target, metric, selection[metric])
            target["valid_years"] = int(selection.soil_water_0_100_mm.notna().sum())
            target["status"] = "ok" if target["valid_years"] else "missing"

    comparison = document["comparison"]
    annual_precip = monthly.groupby("year")["precipitation_mm"].sum(min_count=12)
    early_precip = summarize(_finite(annual_precip.loc[annual_precip.index.isin(_DECADES["1996-2005"])]))["median"]
    late_precip = summarize(_finite(annual_precip.loc[annual_precip.index.isin(_DECADES["2016-2025"])]))["median"]
    if early_precip not in (None, 0) and late_precip is not None:
        comparison["annual_precip_change_pct"] = round(100 * (late_precip - early_precip) / early_precip, 2)

    summer = monthly.loc[monthly.month.isin((6, 7, 8))].groupby("year")["soil_water_0_100_mm"].mean()
    early_soil = summarize(_finite(summer.loc[summer.index.isin(_DECADES["1996-2005"])]))["median"]
    late_soil = summarize(_finite(summer.loc[summer.index.isin(_DECADES["2016-2025"])]))["median"]
    if early_soil is not None and late_soil is not None:
        comparison["summer_soil_water_change_mm"] = round(late_soil - early_soil, 2)

    dry = monthly.groupby("year")["spei3"].agg(
        lambda values: float((values < -1.0).sum()) if values.notna().sum() == 12 else np.nan
    )
    early_dry = summarize(_finite(dry.loc[dry.index.isin(_DECADES["1996-2005"])]))["median"]
    late_dry = summarize(_finite(dry.loc[dry.index.isin(_DECADES["2016-2025"])]))["median"]
    if early_dry is not None and late_dry is not None:
        comparison["dry_months_change"] = round(late_dry - early_dry, 2)

    document["quality"]["variables"] = _quality(land, drought)
    document["quality"]["monthly_completeness"] = {
        "minimum_daily_coverage": 0.9,
        "rule": "un mois journalier ERA5-Land est null si moins de 90 % de ses jours sont valides",
        "monthly_source": "les moyennes mensuelles ERA5-Land sont déjà agrégées par CDS",
        "spei3": "une seule valeur valide est requise par mois ; les doublons sont nulls",
    }
    document["quality"]["generated_at"] = context.generated_at or datetime.now(timezone.utc).isoformat()
    return document
