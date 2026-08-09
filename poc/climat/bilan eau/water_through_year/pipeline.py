"""Orchestration : séries ERA5 -> indicateurs -> document JSON explicite."""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .aggregation import monthly_aggregate, reference_percentile, summarize
from .data import prepare_land_daily, prepare_land_monthly_mean, prepare_spei3_monthly
from .schema import MONTH_KEYS, empty_document

_DECADES = {
    "1996-2005": range(1996, 2006),
    "2006-2015": range(2006, 2016),
    "2016-2025": range(2016, 2026),
}
_OPTIONAL_METRICS = (
    "soil_water_layer_1_m3m3", "runoff_mm", "surface_runoff_mm", "sub_surface_runoff_mm",
    "snowfall_mm_we", "snowmelt_mm_we", "snow_depth_water_equivalent_mm",
)


def _decade(year: int) -> str | None:
    return next((name for name, years in _DECADES.items() if year in years), None)


def _finite(values: pd.Series) -> list[float]:
    return [float(value) for value in values.dropna().tolist() if np.isfinite(value)]


def _set_statistics(target: dict, metric: str, values: pd.Series) -> None:
    stats = summarize(_finite(values))
    for statistic, value in stats.items():
        target[f"{metric}_{statistic}"] = value


def _quality(monthly: pd.DataFrame, spei: pd.DataFrame) -> dict:
    variables: dict[str, dict] = {}
    for column in ("precipitation_mm", "soil_water_0_100_mm", "actual_evapotranspiration_mm"):
        if column in monthly:
            expected = 35 * 12
            valid = int(monthly.loc[(monthly.year >= 1991) & (monthly.year <= 2025), column].notna().sum())
            variables[column] = {"valid_months": valid, "expected_months": expected,
                                  "status": "ok" if valid == expected else "incomplete"}
    spei_valid = int(spei.loc[(spei.year >= 1991) & (spei.year <= 2025), "spei3"].notna().sum()) if not spei.empty else 0
    variables["spei3"] = {"valid_months": spei_valid, "expected_months": 35 * 12,
                          "status": "ok" if spei_valid == 35 * 12 else "incomplete"}
    return variables


def compute(
    era5_land: pd.DataFrame,
    spei3: pd.Series,
    *,
    tile_id: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    representativity: dict | None = None,
    dataset_version: str | None = None,
    retrieved_at: str | None = None,
    era5_land_frequency: str = "daily",
) -> dict:
    """Produit le JSON à partir de données réelles déjà extraites.

    ``era5_land`` est quotidien ou infra-quotidien et doit contenir les cinq
    variables primaires ERA5-Land. ``spei3`` comporte une valeur par mois.
    Le renderer ne reçoit ensuite que le document retourné ici.
    """
    document = empty_document(tile_id, lat, lon)
    document["representativity"].update(representativity or {})
    document["sources"]["dataset_version"] = dataset_version
    document["sources"]["retrieved_at"] = retrieved_at or datetime.now(timezone.utc).isoformat()

    if era5_land_frequency == "daily":
        land_monthly = monthly_aggregate(prepare_land_daily(era5_land))
    elif era5_land_frequency == "monthly_mean_daily":
        # Une ligne est déjà une agrégation mensuelle ; ne pas la soumettre à
        # la règle de couverture quotidienne prévue pour les données journalières.
        prepared = prepare_land_monthly_mean(era5_land)
        land_monthly = prepared.copy()
        land_monthly["year"] = land_monthly.index.year
        land_monthly["month"] = land_monthly.index.month
        land_monthly["expected_days"] = land_monthly.index.days_in_month
    else:
        raise ValueError("era5_land_frequency doit être 'daily' ou 'monthly_mean_daily'.")
    drought_monthly = prepare_spei3_monthly(spei3)
    if land_monthly.empty:
        raise ValueError("Aucune donnée ERA5-Land mensuelle exploitable.")
    monthly = land_monthly.merge(drought_monthly, on=["year", "month"], how="outer")
    monthly = monthly.loc[(monthly.year >= 1991) & (monthly.year <= 2025)].copy()

    # Référence par mois de calendrier, puis position relative annuelle du stock.
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
        for metric in ("precipitation_mm", "soil_water_0_100_mm", "actual_evapotranspiration_mm", "spei3"):
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
            for metric in ("precipitation_mm", "soil_water_0_100_mm", "actual_evapotranspiration_mm", "spei3",
                           "soil_water_reference_percentile", *_OPTIONAL_METRICS):
                if metric in selection:
                    _set_statistics(target, metric, selection[metric])
            target["valid_years"] = int(selection.soil_water_0_100_mm.notna().sum())
            target["status"] = "ok" if target["valid_years"] else "missing"

    _comparison(document, monthly)
    document["quality"]["variables"] = _quality(land_monthly, drought_monthly)
    document["quality"]["monthly_completeness"] = {
        "minimum_daily_coverage": 0.9,
        "rule": "un mois journalier ERA5-Land est null si moins de 90 % de ses jours sont valides",
        "monthly_source": "les moyennes mensuelles ERA5-Land sont déjà agrégées par CDS",
        "spei3": "une seule valeur valide est requise par mois ; les doublons sont nulls",
    }
    document["quality"]["generated_at"] = datetime.now(timezone.utc).isoformat()
    return document


def _comparison(document: dict, monthly: pd.DataFrame) -> None:
    """Trois métriques V1, toutes calculées par année avant comparaison."""
    comp = document["comparison"]
    annual_precip = monthly.groupby("year")["precipitation_mm"].sum(min_count=12)
    early_precip = summarize(_finite(annual_precip.loc[annual_precip.index.isin(_DECADES["1996-2005"])]))["median"]
    late_precip = summarize(_finite(annual_precip.loc[annual_precip.index.isin(_DECADES["2016-2025"])]))["median"]
    if early_precip not in (None, 0) and late_precip is not None:
        comp["annual_precip_change_pct"] = round(100 * (late_precip - early_precip) / early_precip, 2)

    summer = monthly.loc[monthly.month.isin((6, 7, 8))].groupby("year")["soil_water_0_100_mm"].mean()
    early_soil = summarize(_finite(summer.loc[summer.index.isin(_DECADES["1996-2005"])]))["median"]
    late_soil = summarize(_finite(summer.loc[summer.index.isin(_DECADES["2016-2025"])]))["median"]
    if early_soil is not None and late_soil is not None:
        comp["summer_soil_water_change_mm"] = round(late_soil - early_soil, 2)

    # Une année incomplète n'est pas artificiellement interprétée comme sans
    # mois sec : elle reste inconnue et sort de la comparaison.
    dry = monthly.groupby("year")["spei3"].agg(
        lambda values: float((values < -1.0).sum()) if values.notna().sum() == 12 else np.nan
    )
    early_dry = summarize(_finite(dry.loc[dry.index.isin(_DECADES["1996-2005"])]))["median"]
    late_dry = summarize(_finite(dry.loc[dry.index.isin(_DECADES["2016-2025"])]))["median"]
    if early_dry is not None and late_dry is not None:
        comp["dry_months_change"] = round(late_dry - early_dry, 2)
