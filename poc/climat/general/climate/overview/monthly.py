import pandas as pd
import numpy as np

def compute_monthly_climatology(daily_df: pd.DataFrame) -> dict:
    """
    Computes monthly climatologies from 1991-2020 daily data.
    daily_df must have a DatetimeIndex and columns ['t2m', 'tp'].
    
    Returns a dictionary of monthly data (1-12) containing:
    - temperature_c: mean, p10, p50, p90
    - precipitation_mm: mean, p10, p50, p90
    """
    
    # 1. Filter for 1991-2020
    df = daily_df[(daily_df.index.year >= 1991) & (daily_df.index.year <= 2020)].copy()
    
    # 2. Resample to monthly values for each year
    # Temperature: mean
    # Precipitation: sum (cumul)
    monthly_series = df.resample('ME').agg({
        't2m': 'mean',
        'tp': 'sum'
    })
    
    monthly_series['month'] = monthly_series.index.month
    
    results = []
    
    for month in range(1, 13):
        # 30 values for this month
        month_data = monthly_series[monthly_series['month'] == month]
        
        t2m_vals = month_data['t2m'].dropna().values
        tp_vals = month_data['tp'].dropna().values
        
        # Calculate stats
        t2m_mean = float(np.mean(t2m_vals)) if len(t2m_vals) > 0 else None
        t2m_p10 = float(np.percentile(t2m_vals, 10)) if len(t2m_vals) > 0 else None
        t2m_p50 = float(np.percentile(t2m_vals, 50)) if len(t2m_vals) > 0 else None
        t2m_p90 = float(np.percentile(t2m_vals, 90)) if len(t2m_vals) > 0 else None
        
        tp_mean = float(np.mean(tp_vals)) if len(tp_vals) > 0 else None
        tp_p10 = float(np.percentile(tp_vals, 10)) if len(tp_vals) > 0 else None
        tp_p50 = float(np.percentile(tp_vals, 50)) if len(tp_vals) > 0 else None
        tp_p90 = float(np.percentile(tp_vals, 90)) if len(tp_vals) > 0 else None
        
        results.append({
            "month": month,
            "temperature_c": {
                "mean": round(t2m_mean, 1) if t2m_mean is not None else None,
                "p10": round(t2m_p10, 1) if t2m_p10 is not None else None,
                "p50": round(t2m_p50, 1) if t2m_p50 is not None else None,
                "p90": round(t2m_p90, 1) if t2m_p90 is not None else None
            },
            "precipitation_mm": {
                "mean": round(tp_mean, 1) if tp_mean is not None else None,
                "p10": round(tp_p10, 1) if tp_p10 is not None else None,
                "p50": round(tp_p50, 1) if tp_p50 is not None else None,
                "p90": round(tp_p90, 1) if tp_p90 is not None else None
            }
        })
        
    return results
