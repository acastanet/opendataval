from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

REFERENCE_START = 1991
REFERENCE_END = 2020
MONTH_NAMES = (
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
)


@dataclass(frozen=True)
class ClimateOverviewInput:
    temperature_c: pd.Series
    precipitation_m: pd.Series


@dataclass(frozen=True)
class OverviewContext:
    latitude: float
    longitude: float
    grid_latitude: float
    grid_longitude: float
    area_m2: float = 0.0
    geometry_type: str = "Point"


def _reference(series: pd.Series) -> pd.Series:
    index = pd.to_datetime(series.index, utc=True)
    values = pd.Series(pd.to_numeric(series, errors="coerce").to_numpy(), index=index).sort_index()
    return values.loc[(values.index.year >= REFERENCE_START) & (values.index.year <= REFERENCE_END)]


def _percentiles(values: list[float]) -> tuple[float, float, float]:
    array = np.asarray(values, dtype=float)
    return tuple(float(np.percentile(array, q, method="linear")) for q in (10, 50, 90))


def _round1(value: float) -> float:
    return round(float(value), 1)


def compute_climate_overview_data(series: ClimateOverviewInput, *, context: OverviewContext) -> dict[str, Any]:
    temperature = _reference(series.temperature_c)
    precipitation = _reference(series.precipitation_m)
    if temperature.empty or precipitation.empty:
        raise ValueError("Séries 1991–2020 absentes")

    # La méthode POC travaille sur un climat quotidien avant agrégation mensuelle.
    daily_temperature = temperature.resample("D").mean()
    daily_precipitation_mm = precipitation.resample("D").sum(min_count=1) * 1000.0

    monthly_temp_by_year = daily_temperature.groupby([daily_temperature.index.year, daily_temperature.index.month]).mean()
    monthly_precip_by_year = daily_precipitation_mm.groupby([daily_precipitation_mm.index.year, daily_precipitation_mm.index.month]).sum(min_count=1)

    monthly: list[dict[str, Any]] = []
    for month in range(1, 13):
        temp_values = [float(value) for value in monthly_temp_by_year.xs(month, level=1).dropna().tolist()]
        precip_values = [float(value) for value in monthly_precip_by_year.xs(month, level=1).dropna().tolist()]
        if len(temp_values) != 30 or len(precip_values) != 30:
            raise ValueError(f"Référence mensuelle incomplète pour le mois {month}")
        tp10, tp50, tp90 = _percentiles(temp_values)
        pp10, pp50, pp90 = _percentiles(precip_values)
        monthly.append({
            "month": month,
            "temperature_c": {
                "mean": _round1(np.mean(temp_values)),
                "p10": _round1(tp10),
                "p50": _round1(tp50),
                "p90": _round1(tp90),
            },
            "precipitation_mm": {
                "mean": _round1(np.mean(precip_values)),
                "p10": _round1(pp10),
                "p50": _round1(pp50),
                "p90": _round1(pp90),
            },
        })

    temp_means = [item["temperature_c"]["mean"] for item in monthly]
    precip_means = [item["precipitation_mm"]["mean"] for item in monthly]
    warmest = int(np.argmax(temp_means)) + 1
    coldest = int(np.argmin(temp_means)) + 1
    wettest = int(np.argmax(precip_means)) + 1
    driest = int(np.argmin(precip_means)) + 1

    annual_precip = daily_precipitation_mm.groupby(daily_precipitation_mm.index.year).sum(min_count=365)
    annual = {
        # Pondération naturelle des jours de l'année, conforme au résumé POC.
        "mean_temperature_c": _round1(daily_temperature.mean()),
        "precipitation_mm": _round1(annual_precip.mean()),
        "warmest_month": {"month": warmest, "name": MONTH_NAMES[warmest - 1], "value": temp_means[warmest - 1]},
        "coldest_month": {"month": coldest, "name": MONTH_NAMES[coldest - 1], "value": temp_means[coldest - 1]},
        "wettest_month": {"month": wettest, "name": MONTH_NAMES[wettest - 1], "value": precip_means[wettest - 1]},
        "driest_month": {"month": driest, "name": MONTH_NAMES[driest - 1], "value": precip_means[driest - 1]},
    }

    return {
        "schema_version": "1.0",
        "zone": {
            "geometry_type": context.geometry_type,
            "area_m2": context.area_m2,
            "centroid": {"lat": round(context.latitude, 4), "lon": round(context.longitude, 4)},
        },
        "reference": {"start": REFERENCE_START, "end": REFERENCE_END},
        "representativity": {
            "datasets": ["reanalysis-era5-land-timeseries"],
            "grid_cell_count": 1,
            "spatial_weighting": "area_weighted",
            "cells": [{"lat": context.grid_latitude, "lon": context.grid_longitude, "weight": 1.0}],
        },
        "monthly": monthly,
        "annual": annual,
        "quality": {"note": "Canonical temperature/precipitation core only."},
        "provenance": {"source": "Copernicus Climate Data Store", "retrieval_method": "ClimateSnapshot replay"},
    }
