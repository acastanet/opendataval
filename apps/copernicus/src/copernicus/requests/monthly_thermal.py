from __future__ import annotations

import calendar


DATASET_NAME = "derived-utci-historical"
DATASET_VERSION = "1.1"
REFERENCE_DATASET_NAME = "derived-utci-historical-timeseries"
REFERENCE_DATASET_VERSION = "1.1"
GRID_DEGREES = 0.25


def nearest_grid_area(*, latitude: float, longitude: float) -> list[float]:
    """Construit une petite emprise contenant exactement la maille UTCI la plus proche."""
    grid_latitude = round(latitude / GRID_DEGREES) * GRID_DEGREES
    grid_longitude = round(longitude / GRID_DEGREES) * GRID_DEGREES
    epsilon = 0.001
    return [
        round(min(90, grid_latitude + epsilon), 3),
        round(max(-180, grid_longitude - epsilon), 3),
        round(max(-90, grid_latitude - epsilon), 3),
        round(min(180, grid_longitude + epsilon), 3),
    ]


def build_monthly_request(
    *,
    year: int,
    month: int,
    latitude: float,
    longitude: float,
    product_type: str = "intermediate_dataset",
) -> dict[str, object]:
    if not 1940 <= year <= 2100:
        raise ValueError("Année invalide")
    if not 1 <= month <= 12:
        raise ValueError("Mois invalide")
    if not -90 <= latitude <= 90:
        raise ValueError("Latitude invalide")
    if not -180 <= longitude <= 180:
        raise ValueError("Longitude invalide")
    if product_type not in {"consolidated_dataset", "intermediate_dataset"}:
        raise ValueError("Type de produit invalide")

    return {
        "variable": ["universal_thermal_climate_index"],
        "version": "1_1",
        "product_type": product_type,
        "year": [str(year)],
        "month": [f"{month:02d}"],
        "day": [
            f"{day:02d}"
            for day in range(1, calendar.monthrange(year, month)[1] + 1)
        ],
        # Une emprise de taille nulle est rejetée par le produit maillé. Cette petite
        # boîte sélectionne une seule maille à 0,25°, la plus proche du point demandé.
        "area": nearest_grid_area(latitude=latitude, longitude=longitude),
    }


def build_reference_utci_request(*, latitude: float, longitude: float) -> dict[str, object]:
    if not -90 <= latitude <= 90:
        raise ValueError("Latitude invalide")
    if not -180 <= longitude <= 180:
        raise ValueError("Longitude invalide")
    return {
        "variable": ["universal_thermal_climate_index"],
        "data_format": "csv",
        "date": "1991-01-01/2020-12-31",
        "area": nearest_grid_area(latitude=latitude, longitude=longitude),
    }
