import pandas as pd

def get_month_name(month: int) -> str:
    names = {
        1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril",
        5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août",
        9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
    }
    return names.get(month, "")

def compute_annual_indicators(daily_df: pd.DataFrame, monthly_climatology: list) -> dict:
    """
    Computes annual indicators based on 1991-2020 data.
    """
    # 1. Filter for 1991-2020
    df = daily_df[(daily_df.index.year >= 1991) & (daily_df.index.year <= 2020)].copy()
    
    # Calculate yearly aggregates
    yearly_t2m = df['t2m'].resample('YE').mean()
    yearly_tp = df['tp'].resample('YE').sum()
    
    mean_temp_annual = float(yearly_t2m.mean())
    mean_precip_annual = float(yearly_tp.mean())
    
    # Find warmest/coldest/wettest/driest month from climatology
    t2m_means = [(m["month"], m["temperature_c"]["mean"]) for m in monthly_climatology if m["temperature_c"]["mean"] is not None]
    tp_means = [(m["month"], m["precipitation_mm"]["mean"]) for m in monthly_climatology if m["precipitation_mm"]["mean"] is not None]
    
    warmest = max(t2m_means, key=lambda x: x[1]) if t2m_means else (None, None)
    coldest = min(t2m_means, key=lambda x: x[1]) if t2m_means else (None, None)
    wettest = max(tp_means, key=lambda x: x[1]) if tp_means else (None, None)
    driest = min(tp_means, key=lambda x: x[1]) if tp_means else (None, None)
    
    # Frost days: jours où tmin < 0°C (réels depuis les données horaires)
    if 'tmin' not in df.columns:
        # Fallback: si on n'a pas tmin, on approxime à partir de la moyenne
        df['tmin'] = df['t2m'] - 5.0
    if 'tmax' not in df.columns:
        df['tmax'] = df['t2m'] + 5.0
        
    frost_days_per_year = (df['tmin'] < 0).resample('YE').sum()
    hot_days_per_year = (df['tmax'] >= 30).resample('YE').sum()
    tropical_nights_per_year = (df['tmin'] >= 20).resample('YE').sum()
    
    frost_days_mean = float(frost_days_per_year.mean())
    hot_days_mean = float(hot_days_per_year.mean())
    tropical_nights_mean = float(tropical_nights_per_year.mean())
    
    return {
        "mean_temperature_c": round(mean_temp_annual, 1),
        "precipitation_mm": round(mean_precip_annual, 1),
        "warmest_month": {
            "month": warmest[0],
            "name": get_month_name(warmest[0]) if warmest[0] else None,
            "value": round(warmest[1], 1) if warmest[1] is not None else None
        },
        "coldest_month": {
            "month": coldest[0],
            "name": get_month_name(coldest[0]) if coldest[0] else None,
            "value": round(coldest[1], 1) if coldest[1] is not None else None
        },
        "wettest_month": {
            "month": wettest[0],
            "name": get_month_name(wettest[0]) if wettest[0] else None,
            "value": round(wettest[1], 1) if wettest[1] is not None else None
        },
        "driest_month": {
            "month": driest[0],
            "name": get_month_name(driest[0]) if driest[0] else None,
            "value": round(driest[1], 1) if driest[1] is not None else None
        },
        "frost_days_mean": round(frost_days_mean, 1),
        "hot_days_30c_mean": round(hot_days_mean, 1),
        "tropical_nights_20c_mean": round(tropical_nights_mean, 1),
        "snow_indicator": None,
        "wind_speed_mean_ms": None
    }
