"""Téléchargement CDS des cinq séries requises pour un point géographique."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from ecmwf.datastores import Client as DatastoresClient


START_DATE = "1991-01-01"
END_DATE = "2025-12-31"
YEARS = [str(year) for year in range(1991, 2026)]
MONTHS = [f"{month:02d}" for month in range(1, 13)]


@dataclass(frozen=True)
class GridPoint:
    latitude: float
    longitude: float
    resolution: str


def _validate_point(latitude: float, longitude: float) -> None:
    if not -90 <= latitude <= 90:
        raise ValueError("La latitude doit être comprise entre -90 et 90")
    if not -180 <= longitude <= 180:
        raise ValueError("La longitude doit être comprise entre -180 et 180")


def nearest_grid_point(latitude: float, longitude: float, step: float) -> GridPoint:
    _validate_point(latitude, longitude)
    return GridPoint(
        latitude=round(round(latitude / step) * step, 6),
        longitude=round(round(longitude / step) * step, 6),
        resolution=f"{step:g}°".replace(".", ","),
    )


def _area(point: GridPoint) -> list[float]:
    margin = 0.001
    return [
        round(point.latitude + margin, 6),
        round(point.longitude - margin, 6),
        round(point.latitude - margin, 6),
        round(point.longitude + margin, 6),
    ]


def _credentials(path: Path | None = None) -> tuple[str, str]:
    url = os.getenv("COPERNICUS_CDS_URL")
    key = os.getenv("COPERNICUS_CDS_KEY")
    if url and key:
        return url, key
    credential_path = path or Path.home() / ".cdsapirc"
    if not credential_path.exists():
        raise RuntimeError(
            "Configuration CDS absente : créer ~/.cdsapirc ou définir "
            "COPERNICUS_CDS_URL et COPERNICUS_CDS_KEY"
        )
    values: dict[str, str] = {}
    for line in credential_path.read_text(encoding="utf-8").splitlines():
        if ":" in line:
            name, value = line.split(":", 1)
            values[name.strip()] = value.strip()
    if not values.get("url") or not values.get("key"):
        raise RuntimeError("Le fichier .cdsapirc doit contenir url et key")
    return values["url"], values["key"]


def _retrieve(
    client: DatastoresClient,
    dataset: str,
    request: dict[str, object],
    target: Path,
) -> None:
    if target.exists() and target.stat().st_size > 0:
        print(f"Réutilisation : {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    client.retrieve(dataset, request, str(target))
    print(f"Téléchargé : {target}")


def download_climate_assets(
    latitude: float,
    longitude: float,
    raw_directory: Path,
    *,
    credentials_path: Path | None = None,
) -> dict[str, GridPoint]:
    """Télécharge ERA5-Land, ERA5-HEAT et ERA5-Drought pour le point demandé."""
    land_grid = nearest_grid_point(latitude, longitude, 0.1)
    derived_grid = nearest_grid_point(latitude, longitude, 0.25)
    url, key = _credentials(credentials_path)
    client = DatastoresClient(url=url, key=key, progress=False, timeout=300)

    land_assets = {
        "era5-land.csv": "2m_temperature",
        "era5-land-precipitation.csv": "total_precipitation",
        "era5-land-u10.csv": "10m_u_component_of_wind",
        "era5-land-v10.csv": "10m_v_component_of_wind",
    }
    for filename, variable in land_assets.items():
        _retrieve(client, "reanalysis-era5-land-timeseries", {
            "variable": [variable],
            "data_format": "csv",
            "date": f"{START_DATE}/{END_DATE}",
            "area": _area(land_grid),
        }, raw_directory / filename)

    _retrieve(client, "derived-utci-historical-timeseries", {
        "variable": ["universal_thermal_climate_index"],
        "data_format": "csv",
        "date": f"{START_DATE}/{END_DATE}",
        "area": _area(derived_grid),
    }, raw_directory / "utci.csv")
    _retrieve(client, "derived-drought-historical-monthly", {
        "variable": ["standardised_precipitation_evapotranspiration_index"],
        "accumulation_period": "3",
        "version": "1_0",
        "product_type": "reanalysis",
        "dataset_type": "consolidated_dataset",
        "year": YEARS,
        "month": MONTHS,
        "area": _area(derived_grid),
    }, raw_directory / "spei3.nc")
    return {"era5_land": land_grid, "derived": derived_grid}
