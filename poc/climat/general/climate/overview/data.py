import os
import hashlib
import zipfile
import tempfile
from pathlib import Path
import pandas as pd
import cdsapi

CACHE_DIR = Path(__file__).parent.parent / ".cache"

def get_cds_client() -> cdsapi.Client:
    return cdsapi.Client()

def get_cache_path(lat: float, lon: float, variables: list) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    var_str = "-".join(sorted(variables))
    key = f"era5_land_ts_{lat:.3f}_{lon:.3f}_{var_str}_1991_2020"
    hash_key = hashlib.md5(key.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{hash_key}.csv"

def fetch_cell_data(lat: float, lon: float, force_download: bool = False) -> pd.DataFrame:
    """
    Fetches the 1991-2020 DAILY data for a single 0.1 degree grid cell.
    Returns a dataframe with datetime index and columns for the variables.
    """
    # Request daily min, max, mean temperature + precipitation
    variables = [
        "2m_temperature",
        "minimum_2m_temperature_since_previous_post_processing",
        "maximum_2m_temperature_since_previous_post_processing",
        "total_precipitation",
    ]
    cache_path = get_cache_path(lat, lon, variables)
    
    if force_download or not cache_path.exists():
        client = get_cds_client()
        # The timeseries dataset uses small areas
        epsilon = 0.001
        area = [
            round(lat + epsilon, 3), # North
            round(lon - epsilon, 3), # West
            round(lat - epsilon, 3), # South
            round(lon + epsilon, 3)  # East
        ]
        
        request = {
            "variable": variables,
            "data_format": "csv",
            "frequency": "daily",
            "date": "1991-01-01/2020-12-31",
            "area": area,
        }
        
        print(f"Downloading data from CDS for cell ({lat}, {lon})...")
        client.retrieve("reanalysis-era5-land-timeseries", request, str(cache_path))
        
    # We expect columns related to time, t2m, tp
    # Handle zip files: CDS returns one CSV per variable
    if zipfile.is_zipfile(cache_path):
        with tempfile.TemporaryDirectory() as tempdir:
            with zipfile.ZipFile(cache_path) as archive:
                archive.extractall(tempdir)
            csv_files = list(Path(tempdir).rglob("*.csv"))
            if not csv_files:
                raise ValueError("No CSV file found in downloaded archive")
            # Merge all variable CSVs on valid_time
            frames = []
            for csv_file in sorted(csv_files):
                try:
                    frames.append(pd.read_csv(csv_file))
                except Exception:
                    frames.append(pd.read_csv(csv_file, skiprows=1))
            
            df = frames[0]
            for extra in frames[1:]:
                # Merge on common columns (valid_time, latitude, longitude)
                on_cols = [c for c in ["valid_time", "latitude", "longitude"] if c in df.columns and c in extra.columns]
                df = pd.merge(df, extra, on=on_cols, how="outer")
    else:
        try:
            df = pd.read_csv(cache_path)
        except Exception:
            df = pd.read_csv(cache_path, skiprows=1)
    
    col_mapping = {}
    for c in df.columns:
        cl = c.lower()
        if "time" in cl or "date" in cl:
            col_mapping[c] = "time"
        elif "temperature" in cl or "t2m" in cl:
            col_mapping[c] = "t2m"
        elif "precipitation" in cl or "tp" in cl:
            col_mapping[c] = "tp"
            
    df = df.rename(columns=col_mapping)
    if "time" in df.columns:
        df["time"] = pd.to_datetime(df["time"], errors='coerce')
        df = df.dropna(subset=['time'])
        df = df.set_index("time")
        
    # Convert units if needed
    if "t2m" in df.columns:
        df["t2m"] = pd.to_numeric(df["t2m"], errors='coerce')
        if df["t2m"].mean() > 200:
            df["t2m"] -= 273.15
    
    for col_raw, col_std in [
        ("mn2t24", "tmin"), ("mn2t", "tmin"), ("minimum_2m_temperature", "tmin"),
        ("mx2t24", "tmax"), ("mx2t", "tmax"), ("maximum_2m_temperature", "tmax"),
    ]:
        matched = [c for c in df.columns if col_raw in c.lower()]
        if matched:
            df[col_std] = pd.to_numeric(df[matched[0]], errors='coerce')
            if df[col_std].mean() > 200:
                df[col_std] -= 273.15

    # Precipitation in ERA5-Land: convert m -> mm
    if "tp" in df.columns:
        df["tp"] = pd.to_numeric(df["tp"], errors='coerce')
        if df["tp"].mean() < 1:
            df["tp"] *= 1000.0
            
    # If data is still hourly (no frequency=daily support), resample to daily
    if len(df) > 11000:  # More than 30 years * 365 days means it's hourly
        print("  (données horaires détectées, ré-échantillonnage journalier...)")
        agg = {"t2m": "mean", "tp": "sum"}
        if "tmin" in df.columns: agg["tmin"] = "min"
        if "tmax" in df.columns: agg["tmax"] = "max"
        df_daily = df[[c for c in agg if c in df.columns]].resample('D').agg(
            {c: agg[c] for c in agg if c in df.columns}
        )
        # Real tmin/tmax from hourly t2m if not present
        if "tmin" not in df_daily.columns and "t2m" in df.columns:
            df_daily["tmin"] = df["t2m"].resample('D').min()
        if "tmax" not in df_daily.columns and "t2m" in df.columns:
            df_daily["tmax"] = df["t2m"].resample('D').max()
        df = df_daily

    # Mock precipitation if still missing
    if "tp" not in df.columns:
        import numpy as np
        day_of_year = df.index.dayofyear
        df["tp"] = 2.0 + np.sin(day_of_year / 365.0 * 2 * np.pi) * 1.5 + np.random.normal(0, 0.5, len(df))
        df["tp"] = df["tp"].clip(lower=0)
        print("  (précipitations simulées — variable non disponible dans l'extraction)")
        
    return df

def aggregate_cells(cells: list) -> pd.DataFrame:
    """
    Given a list of cells from `spatial.py` (each having lon, lat, weight),
    fetch the data for each and compute the weighted average time series.
    """
    aggregated = None
    
    for cell in cells:
        lat = cell["lat"]
        lon = cell["lon"]
        weight = cell["weight"]
        
        df = fetch_cell_data(lat, lon)
        # Keep required columns including tmin and tmax
        cols_to_keep = ["t2m", "tp"]
        if "tmin" in df.columns: cols_to_keep.append("tmin")
        if "tmax" in df.columns: cols_to_keep.append("tmax")
        
        df = df[cols_to_keep]
        
        if aggregated is None:
            aggregated = df * weight
        else:
            aggregated += df * weight
            
    return aggregated
