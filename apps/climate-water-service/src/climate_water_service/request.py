from __future__ import annotations

from dataclasses import dataclass
from typing import Any

YEARS = [str(year) for year in range(1991, 2026)]
MONTHS = [f"{month:02d}" for month in range(1, 13)]
LAND_VARIABLES = [
    "total_precipitation",
    "volumetric_soil_water_layer_1",
    "volumetric_soil_water_layer_2",
    "volumetric_soil_water_layer_3",
    "total_evaporation",
]


@dataclass(frozen=True)
class GridPoint:
    latitude: float
    longitude: float


def nearest_grid_point(latitude: float, longitude: float, step: float) -> GridPoint:
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Coordonnées géographiques invalides")
    return GridPoint(round(round(latitude / step) * step, 6), round(round(longitude / step) * step, 6))


def _area(point: GridPoint) -> list[float]:
    return [point.latitude + 0.001, point.longitude - 0.001, point.latitude - 0.001, point.longitude + 0.001]


def request_parameters(latitude: float, longitude: float) -> tuple[GridPoint, GridPoint, dict[str, Any], dict[str, Any]]:
    land = nearest_grid_point(latitude, longitude, 0.1)
    drought = nearest_grid_point(latitude, longitude, 0.25)
    land_request = {
        "dataset": "reanalysis-era5-land-monthly-means",
        "request": {
            "product_type": ["monthly_averaged_reanalysis"],
            "variable": LAND_VARIABLES,
            "year": YEARS,
            "month": MONTHS,
            "time": ["00:00"],
            "data_format": "netcdf",
            "download_format": "unarchived",
            "area": _area(land),
        },
    }
    drought_request = {
        "dataset": "derived-drought-historical-monthly",
        "request": {
            "variable": ["standardised_precipitation_evapotranspiration_index"],
            "accumulation_period": "3",
            "version": "1_0",
            "product_type": "reanalysis",
            "dataset_type": "consolidated_dataset",
            "year": YEARS,
            "month": MONTHS,
            "data_format": "netcdf",
            "download_format": "unarchived",
            "area": _area(drought),
        },
    }
    return land, drought, land_request, drought_request
