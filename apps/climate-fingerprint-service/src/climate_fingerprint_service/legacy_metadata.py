from __future__ import annotations

from typing import Any

START_DATE = "1991-01-01"
END_DATE = "2025-12-31"
YEARS = [str(year) for year in range(1991, 2026)]
MONTHS = [f"{month:02d}" for month in range(1, 13)]


def nearest_grid_point(latitude: float, longitude: float, step: float) -> dict[str, float]:
    if not -90 <= latitude <= 90:
        raise ValueError("La latitude doit être comprise entre -90 et 90")
    if not -180 <= longitude <= 180:
        raise ValueError("La longitude doit être comprise entre -180 et 180")
    return {
        "lat": round(round(latitude / step) * step, 6),
        "lon": round(round(longitude / step) * step, 6),
        "resolution_degrees": step,
    }


def _area(point: dict[str, float]) -> list[float]:
    margin = 0.001
    return [
        round(point["lat"] + margin, 6),
        round(point["lon"] - margin, 6),
        round(point["lat"] - margin, 6),
        round(point["lon"] + margin, 6),
    ]


def legacy_poc_acquisition_metadata(
    latitude: float,
    longitude: float,
    *,
    retrieved_at: str,
) -> dict[str, dict[str, Any]]:
    """Reproduit les paramètres de requête du fetch POC historique.

    Cette fonction ne télécharge rien et n'invente pas la date de récupération :
    ``retrieved_at`` doit provenir de l'exécution d'acquisition réellement utilisée.
    """
    if not retrieved_at:
        raise ValueError("retrieved_at est obligatoire")

    land = nearest_grid_point(latitude, longitude, 0.1)
    derived = nearest_grid_point(latitude, longitude, 0.25)
    land_area = _area(land)
    derived_area = _area(derived)

    metadata: dict[str, dict[str, Any]] = {}
    land_variables = {
        "era5-land-temperature": "2m_temperature",
        "era5-land-precipitation": "total_precipitation",
        "era5-land-u10": "10m_u_component_of_wind",
        "era5-land-v10": "10m_v_component_of_wind",
    }
    for asset_id, variable in land_variables.items():
        metadata[asset_id] = {
            "retrieved_at": retrieved_at,
            "dataset_version": None,
            "period_start": START_DATE,
            "period_end": END_DATE,
            "request_parameters": {
                "variable": [variable],
                "data_format": "csv",
                "date": f"{START_DATE}/{END_DATE}",
                "area": land_area,
            },
            "represented_spatial": land,
            "quality_status": "valid",
            "source_code": "poc/climat/empreinte-climatique/src/empreinte_climatique/fetch.py",
        }

    metadata["era5-heat-utci"] = {
        "retrieved_at": retrieved_at,
        "dataset_version": None,
        "period_start": START_DATE,
        "period_end": END_DATE,
        "request_parameters": {
            "variable": ["universal_thermal_climate_index"],
            "data_format": "csv",
            "date": f"{START_DATE}/{END_DATE}",
            "area": derived_area,
        },
        "represented_spatial": derived,
        "quality_status": "valid",
        "source_code": "poc/climat/empreinte-climatique/src/empreinte_climatique/fetch.py",
    }

    metadata["era5-drought-spei3"] = {
        "retrieved_at": retrieved_at,
        "dataset_version": "1_0",
        "period_start": START_DATE,
        "period_end": END_DATE,
        "request_parameters": {
            "variable": ["standardised_precipitation_evapotranspiration_index"],
            "accumulation_period": "3",
            "version": "1_0",
            "product_type": "reanalysis",
            "dataset_type": "consolidated_dataset",
            "year": YEARS,
            "month": MONTHS,
            "area": derived_area,
        },
        "represented_spatial": derived,
        "quality_status": "valid",
        "source_code": "poc/climat/empreinte-climatique/src/empreinte_climatique/fetch.py",
    }
    return metadata
