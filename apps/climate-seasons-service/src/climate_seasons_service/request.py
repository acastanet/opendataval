from __future__ import annotations

from dataclasses import dataclass

START_DATE = "1991-01-01"
END_DATE = "2025-12-31"


@dataclass(frozen=True)
class GridPoint:
    latitude: float
    longitude: float
    resolution: float


def nearest_grid_point(latitude: float, longitude: float, step: float = 0.1) -> GridPoint:
    if not -90 <= latitude <= 90:
        raise ValueError("latitude hors bornes")
    if not -180 <= longitude <= 180:
        raise ValueError("longitude hors bornes")
    return GridPoint(
        latitude=round(round(latitude / step) * step, 6),
        longitude=round(round(longitude / step) * step, 6),
        resolution=step,
    )


def request_parameters(latitude: float, longitude: float) -> tuple[GridPoint, dict[str, object]]:
    grid = nearest_grid_point(latitude, longitude, 0.1)
    margin = 0.001
    request = {
        "variable": ["2m_temperature"],
        "data_format": "csv",
        "date": f"{START_DATE}/{END_DATE}",
        "area": [
            round(grid.latitude + margin, 6),
            round(grid.longitude - margin, 6),
            round(grid.latitude - margin, 6),
            round(grid.longitude + margin, 6),
        ],
    }
    return grid, request
