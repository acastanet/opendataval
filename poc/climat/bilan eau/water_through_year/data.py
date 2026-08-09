"""Normalisation des entrées ERA5-Land et ERA5-Drought."""

from __future__ import annotations

import pandas as pd

from .aggregation import actual_evapotranspiration_display_mm, metres_to_mm, soil_water_0_100_mm

LAND_REQUIRED = {
    "total_precipitation", "volumetric_soil_water_layer_1", "volumetric_soil_water_layer_2",
    "volumetric_soil_water_layer_3", "total_evaporation",
}


def prepare_land_daily(frame: pd.DataFrame) -> pd.DataFrame:
    """Convertit les unités et crée seulement les variables dérivées documentées."""
    missing = LAND_REQUIRED - set(frame.columns)
    if missing:
        raise ValueError("Variables ERA5-Land manquantes : " + ", ".join(sorted(missing)))
    result = pd.DataFrame(index=frame.index)
    result["precipitation_mm"] = metres_to_mm(frame["total_precipitation"])
    result["soil_water_0_100_mm"] = soil_water_0_100_mm(
        frame["volumetric_soil_water_layer_1"], frame["volumetric_soil_water_layer_2"],
        frame["volumetric_soil_water_layer_3"],
    )
    result["soil_water_layer_1_m3m3"] = pd.to_numeric(frame["volumetric_soil_water_layer_1"], errors="coerce")
    result["actual_evapotranspiration_mm"] = actual_evapotranspiration_display_mm(frame["total_evaporation"])
    optional = {
        "runoff": ("runoff_mm", True), "surface_runoff": ("surface_runoff_mm", True),
        "sub_surface_runoff": ("sub_surface_runoff_mm", True), "snowfall": ("snowfall_mm_we", True),
        "snowmelt": ("snowmelt_mm_we", True),
        "snow_depth_water_equivalent": ("snow_depth_water_equivalent_mm", True),
    }
    for source, (target, convert_mm) in optional.items():
        if source in frame:
            result[target] = metres_to_mm(frame[source]) if convert_mm else pd.to_numeric(frame[source], errors="coerce")
    return result


def prepare_land_monthly_mean(frame: pd.DataFrame) -> pd.DataFrame:
    """Prépare ERA5-Land *monthly averaged reanalysis*.

    Dans ce produit CDS, les variables accumulées sont des moyennes journalières
    mensuelles en m. Les multiplier par le nombre de jours restitue donc la
    somme mensuelle demandée pour la pluie et l'ETa.
    """
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
        frame["volumetric_soil_water_layer_1"], frame["volumetric_soil_water_layer_2"],
        frame["volumetric_soil_water_layer_3"],
    ).to_numpy()
    result["soil_water_layer_1_m3m3"] = pd.to_numeric(frame["volumetric_soil_water_layer_1"], errors="coerce").to_numpy()
    result["actual_evapotranspiration_mm"] = actual_evapotranspiration_display_mm(frame["total_evaporation"]).to_numpy() * days
    for source, target, is_accumulation in (
        ("runoff", "runoff_mm", True), ("surface_runoff", "surface_runoff_mm", True),
        ("sub_surface_runoff", "sub_surface_runoff_mm", True), ("snowfall", "snowfall_mm_we", True),
        ("snowmelt", "snowmelt_mm_we", True),
        ("snow_depth_water_equivalent", "snow_depth_water_equivalent_mm", False),
    ):
        if source in frame:
            values = metres_to_mm(frame[source]).to_numpy()
            result[target] = values * days if is_accumulation else values
    return result


def prepare_spei3_monthly(spei3: pd.Series) -> pd.DataFrame:
    """Préserve la valeur mensuelle SPEI-3 sans somme ni moyenne quotidienne."""
    if not isinstance(spei3.index, pd.DatetimeIndex):
        raise ValueError("SPEI-3 doit être indexé par date.")
    series = pd.to_numeric(spei3, errors="coerce")
    index = series.index.tz_localize("UTC") if series.index.tz is None else series.index.tz_convert("UTC")
    series.index = index
    # Les doublons éventuels du même mois sont invalides : on conserve null.
    rows = []
    for period, values in series.groupby(pd.Grouper(freq="MS")):
        if values.empty:
            continue
        valid = values.dropna()
        rows.append({"year": period.year, "month": period.month,
                     "spei3": float(valid.iloc[0]) if len(valid) == 1 else float("nan"),
                     "spei3_valid_values": len(valid)})
    return pd.DataFrame(rows)
