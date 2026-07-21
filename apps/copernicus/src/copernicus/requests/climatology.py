from __future__ import annotations

from datetime import date


DATASET_NAME = "reanalysis-era5-land-timeseries"
DATASET_VERSION = "1.0.0"
GRID_DEGREES = 0.1


def nearest_grid_area(*, latitude: float, longitude: float) -> list[float]:
    grid_latitude = round(latitude / GRID_DEGREES) * GRID_DEGREES
    grid_longitude = round(longitude / GRID_DEGREES) * GRID_DEGREES
    epsilon = 0.001
    return [
        round(min(90, grid_latitude + epsilon), 3),
        round(max(-180, grid_longitude - epsilon), 3),
        round(max(-90, grid_latitude - epsilon), 3),
        round(min(180, grid_longitude + epsilon), 3),
    ]


def build_climatology_request(
    *,
    latitude: float,
    longitude: float,
    start_date: str = "1991-01-01",
    end_date: str = "2020-12-31",
) -> dict[str, object]:
    if not -90 <= latitude <= 90:
        raise ValueError("Latitude invalide")
    if not -180 <= longitude <= 180:
        raise ValueError("Longitude invalide")
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError as exc:
        raise ValueError("Plage de dates invalide") from exc
    if start > end:
        raise ValueError("Plage de dates inversée")
    return {
        "variable": ["2m_temperature"],
        "data_format": "csv",
        "date": f"{start.isoformat()}/{end.isoformat()}",
        "area": nearest_grid_area(latitude=latitude, longitude=longitude),
    }
