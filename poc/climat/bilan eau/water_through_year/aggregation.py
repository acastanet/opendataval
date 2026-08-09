"""Calculs unitaires et agrégations ; aucun code de rendu dans ce module."""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

SOIL_DEPTHS_M = (0.07, 0.21, 0.72)


def metres_to_mm(values: pd.Series) -> pd.Series:
    return pd.to_numeric(values, errors="coerce") * 1000.0


def soil_water_0_100_mm(theta1: pd.Series, theta2: pd.Series, theta3: pd.Series) -> pd.Series:
    """Stock dérivé OpenDataVdA : eau équivalente des couches 0–100 cm."""
    return 1000.0 * (
        SOIL_DEPTHS_M[0] * pd.to_numeric(theta1, errors="coerce")
        + SOIL_DEPTHS_M[1] * pd.to_numeric(theta2, errors="coerce")
        + SOIL_DEPTHS_M[2] * pd.to_numeric(theta3, errors="coerce")
    )


def actual_evapotranspiration_display_mm(total_evaporation_m: pd.Series) -> pd.Series:
    """Convention ECMWF : l'évaporation est négative ; l'affichage est positif."""
    return -metres_to_mm(total_evaporation_m)


def summarize(values: Iterable[float | int | None]) -> dict[str, float | None]:
    array = np.asarray([value for value in values if value is not None and np.isfinite(value)], dtype=float)
    if not array.size:
        return {"p25": None, "median": None, "p75": None}
    return {
        "p25": round(float(np.percentile(array, 25, method="linear")), 3),
        "median": round(float(np.percentile(array, 50, method="linear")), 3),
        "p75": round(float(np.percentile(array, 75, method="linear")), 3),
    }


def monthly_aggregate(daily: pd.DataFrame, *, min_daily_coverage: float = 0.9) -> pd.DataFrame:
    """Agrège un tableau quotidien en mois, avec somme/stock moyen explicites."""
    if not isinstance(daily.index, pd.DatetimeIndex):
        raise ValueError("Les données ERA5-Land doivent être indexées par date.")
    frame = daily.copy()
    frame.index = frame.index.tz_localize("UTC") if frame.index.tz is None else frame.index.tz_convert("UTC")
    rows: list[dict] = []
    for period, values in frame.groupby(pd.Grouper(freq="MS")):
        if values.empty:
            continue
        expected = int(period.days_in_month)
        row: dict[str, object] = {"year": period.year, "month": period.month, "expected_days": expected}
        for name, kind in (("precipitation_mm", "sum"), ("actual_evapotranspiration_mm", "sum"),
                           ("soil_water_0_100_mm", "mean"), ("soil_water_layer_1_m3m3", "mean"),
                           ("runoff_mm", "sum"), ("surface_runoff_mm", "sum"),
                           ("sub_surface_runoff_mm", "sum"), ("snowfall_mm_we", "sum"),
                           ("snowmelt_mm_we", "sum"), ("snow_depth_water_equivalent_mm", "mean")):
            if name not in values:
                continue
            valid = int(values[name].notna().sum())
            row[f"{name}_valid_days"] = valid
            if valid / expected >= min_daily_coverage:
                row[name] = values[name].sum(min_count=1) if kind == "sum" else values[name].mean()
            else:
                row[name] = np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def reference_percentile(value: float | None, reference_values: Iterable[float | int | None]) -> float | None:
    """Position empirique 0–100 du stock dans sa distribution du même mois."""
    if value is None or not np.isfinite(value):
        return None
    ref = np.asarray([v for v in reference_values if v is not None and np.isfinite(v)], dtype=float)
    if not ref.size:
        return None
    return float(100.0 * np.mean(ref <= value))
