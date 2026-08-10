from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

SOIL_DEPTHS_M = (0.07, 0.21, 0.72)
LAND_REQUIRED = {
    "total_precipitation",
    "volumetric_soil_water_layer_1",
    "volumetric_soil_water_layer_2",
    "volumetric_soil_water_layer_3",
    "total_evaporation",
}


def metres_to_mm(values: pd.Series) -> pd.Series:
    return pd.to_numeric(values, errors="coerce") * 1000.0


def soil_water_0_100_mm(theta1: pd.Series, theta2: pd.Series, theta3: pd.Series) -> pd.Series:
    return 1000.0 * (
        SOIL_DEPTHS_M[0] * pd.to_numeric(theta1, errors="coerce")
        + SOIL_DEPTHS_M[1] * pd.to_numeric(theta2, errors="coerce")
        + SOIL_DEPTHS_M[2] * pd.to_numeric(theta3, errors="coerce")
    )


def actual_evapotranspiration_display_mm(values: pd.Series) -> pd.Series:
    return -metres_to_mm(values)


def summarize(values: Iterable[float | int | None]) -> dict[str, float | None]:
    array = np.asarray([v for v in values if v is not None and np.isfinite(v)], dtype=float)
    if not array.size:
        return {"p25": None, "median": None, "p75": None}
    return {
        "p25": round(float(np.percentile(array, 25, method="linear")), 3),
        "median": round(float(np.percentile(array, 50, method="linear")), 3),
        "p75": round(float(np.percentile(array, 75, method="linear")), 3),
    }


def reference_percentile(value: float | None, reference_values: Iterable[float | int | None]) -> float | None:
    if value is None or not np.isfinite(value):
        return None
    ref = np.asarray([v for v in reference_values if v is not None and np.isfinite(v)], dtype=float)
    if not ref.size:
        return None
    return float(100.0 * np.mean(ref <= value))


def prepare_land_monthly_mean(frame: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(frame.index, pd.DatetimeIndex):
        raise ValueError("Les données mensuelles ERA5-Land doivent être indexées par date.")
    missing = LAND_REQUIRED - set(frame.columns)
    if missing:
        raise ValueError("Variables ERA5-Land manquantes : " + ", ".join(sorted(missing)))
    index = frame.index.tz_localize("UTC") if frame.index.tz is None else frame.index.tz_convert("UTC")
    days = pd.Series(index.days_in_month, index=index, dtype=float)
    result = pd.DataFrame(index=index)
    result["precipitation_mm"] = metres_to_mm(frame["total_precipitation"]).to_numpy() * days
    result["soil_water_0_100_mm"] = soil_water_0_100_mm(
        frame["volumetric_soil_water_layer_1"],
        frame["volumetric_soil_water_layer_2"],
        frame["volumetric_soil_water_layer_3"],
    ).to_numpy()
    result["soil_water_layer_1_m3m3"] = pd.to_numeric(
        frame["volumetric_soil_water_layer_1"], errors="coerce"
    ).to_numpy()
    result["actual_evapotranspiration_mm"] = actual_evapotranspiration_display_mm(
        frame["total_evaporation"]
    ).to_numpy() * days
    return result


def prepare_spei3_monthly(spei3: pd.Series) -> pd.DataFrame:
    if not isinstance(spei3.index, pd.DatetimeIndex):
        raise ValueError("SPEI-3 doit être indexé par date.")
    series = pd.to_numeric(spei3, errors="coerce")
    series.index = series.index.tz_localize("UTC") if series.index.tz is None else series.index.tz_convert("UTC")
    rows: list[dict[str, float | int]] = []
    for period, values in series.groupby(pd.Grouper(freq="MS")):
        if values.empty:
            continue
        valid = values.dropna()
        rows.append({
            "year": period.year,
            "month": period.month,
            "spei3": float(valid.iloc[0]) if len(valid) == 1 else float("nan"),
            "spei3_valid_values": len(valid),
        })
    return pd.DataFrame(rows)
