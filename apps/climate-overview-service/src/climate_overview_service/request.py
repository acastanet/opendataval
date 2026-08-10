from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GridPoint:
    latitude: float
    longitude: float


def nearest_grid_point(latitude: float, longitude: float, step: float = 0.1) -> GridPoint:
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Coordonnées géographiques invalides")
    return GridPoint(round(round(latitude / step) * step, 6), round(round(longitude / step) * step, 6))


def request_parameters(latitude: float, longitude: float) -> tuple[GridPoint, dict]:
    """Paramètres des actifs historiques réutilisés depuis l'empreinte (1991–2025)."""
    grid = nearest_grid_point(latitude, longitude, 0.1)
    area = [grid.latitude + 0.001, grid.longitude - 0.001, grid.latitude - 0.001, grid.longitude + 0.001]
    common = {"date": "1991-01-01/2025-12-31", "data_format": "csv", "area": area}
    return grid, common
