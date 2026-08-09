"""Schéma JSON de sortie versionné (§23)."""

from __future__ import annotations

SCHEMA_VERSION = "1.0"

PERIODS = {
    "reference": [1991, 2020],
    "study": [1996, 2025],
    "early": [1996, 2005],
    "middle": [2006, 2015],
    "late": [2016, 2025],
}


def empty_annual_entry(year: int) -> dict:
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


def empty_document(tile_id: str, lat: float | None, lon: float | None) -> dict:
    """Contrat complet avec toutes les clés attendues ; valeurs réelles en null."""
    return {
        "schema_version": SCHEMA_VERSION,
        "tile": {"tile_id": tile_id, "lat": lat, "lon": lon},
        "source": {
            "dataset": "ERA5-Land",
            "variable": "2m_temperature",
            "grid_lat": None,
            "grid_lon": None,
            "grid_resolution_deg": 0.1,
            "native_resolution_km": 9,
            "retrieved_at": None,
            "credentials_source": None,
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
        "annual": [empty_annual_entry(year) for year in range(1996, 2026)],
        "decades": {
            "1996-2005": {},
            "2006-2015": {},
            "2016-2025": {},
        },
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
