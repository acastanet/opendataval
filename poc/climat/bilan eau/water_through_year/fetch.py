"""Extraction ERA5-Land / ERA5-Drought, isolée des calculs scientifiques."""

from __future__ import annotations

import os
import tempfile
import zipfile
from pathlib import Path

import pandas as pd

START_DATE = "1991-01-01"
END_DATE = "2025-12-31"
YEARS = [str(year) for year in range(1991, 2026)]
MONTHS = [f"{month:02d}" for month in range(1, 13)]
LAND_VARIABLES = ("total_precipitation", "volumetric_soil_water_layer_1", "volumetric_soil_water_layer_2",
                  "volumetric_soil_water_layer_3", "total_evaporation")


def nearest_grid_point(latitude: float, longitude: float, step: float) -> tuple[float, float]:
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Coordonnées géographiques invalides.")
    return round(round(latitude / step) * step, 6), round(round(longitude / step) * step, 6)


def _credentials(path: Path | None) -> tuple[str, str]:
    url, key = os.getenv("COPERNICUS_CDS_URL"), os.getenv("COPERNICUS_CDS_KEY")
    if url and key:
        return url, key
    source = path or Path.home() / ".cdsapirc"
    if not source.exists():
        raise RuntimeError("Configuration CDS absente : .cdsapirc ou variables COPERNICUS_CDS_URL/COPERNICUS_CDS_KEY.")
    fields = dict(line.split(":", 1) for line in source.read_text(encoding="utf-8").splitlines() if ":" in line)
    if not fields.get("url") or not fields.get("key"):
        raise RuntimeError("Le fichier .cdsapirc doit contenir url et key.")
    return fields["url"].strip(), fields["key"].strip()


def download_assets(latitude: float, longitude: float, raw_directory: Path, *, credentials_path: Path | None = None) -> dict:
    """Télécharge les variables principales dans les produits mensuels CDS.

    L'appel réseau est volontairement hors pipeline : le test et le rendu sont
    possibles à partir de fichiers déjà récupérés.
    """
    from ecmwf.datastores import Client

    grid_lat, grid_lon = nearest_grid_point(latitude, longitude, 0.1)
    drought_lat, drought_lon = nearest_grid_point(latitude, longitude, 0.25)
    url, key = _credentials(credentials_path)
    client = Client(url=url, key=key, progress=False, timeout=300)
    raw_directory.mkdir(parents=True, exist_ok=True)
    def area(lat: float, lon: float) -> list[float]:
        return [lat + .001, lon - .001, lat - .001, lon + .001]
    land = raw_directory / "era5-land-monthly.nc"
    if not land.exists() or not land.stat().st_size:
        client.retrieve("reanalysis-era5-land-monthly-means", {
            "product_type": ["monthly_averaged_reanalysis"], "variable": list(LAND_VARIABLES),
            "year": YEARS, "month": MONTHS, "time": ["00:00"], "data_format": "netcdf",
            "download_format": "unarchived", "area": area(grid_lat, grid_lon),
        }, str(land))
    drought = raw_directory / "era5-drought-spei3.nc"
    if not drought.exists() or not drought.stat().st_size:
        client.retrieve("derived-drought-historical-monthly", {
            "variable": ["standardised_precipitation_evapotranspiration_index"], "accumulation_period": "3",
            "version": "1_0", "product_type": "reanalysis", "dataset_type": "consolidated_dataset",
            "year": YEARS, "month": MONTHS, "data_format": "netcdf", "download_format": "unarchived",
            "area": area(drought_lat, drought_lon),
        }, str(drought))
    return {"grid_lat": grid_lat, "grid_lon": grid_lon, "grid_resolution_deg": .1,
            "native_resolution_km": 9, "drought_grid_lat": drought_lat, "drought_grid_lon": drought_lon}


def _time_column(frame: pd.DataFrame) -> str:
    return next((name for name in frame.columns if name.lower() in {"valid_time", "time", "date", "datetime"}), "")


def _netcdf_paths(path: Path, temporary: Path) -> list[Path]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temporary)
        return sorted(candidate for candidate in temporary.rglob("*") if candidate.suffix.lower() in {".nc", ".nc4", ".netcdf"})
    return [path]


def read_land_monthly_netcdf(path: Path) -> pd.DataFrame:
    """Lit les groupes NetCDF CDS et normalise leurs noms courts GRIB."""
    import xarray as xr

    names = {"tp": "total_precipitation", "swvl1": "volumetric_soil_water_layer_1",
             "swvl2": "volumetric_soil_water_layer_2", "swvl3": "volumetric_soil_water_layer_3",
             "e": "total_evaporation"}
    series: dict[str, list[pd.Series]] = {}
    with tempfile.TemporaryDirectory(prefix="era5-land-monthly-") as temporary:
        paths = (sorted(path.glob("era5-land-monthly-*.nc")) if path.is_dir()
                 else _netcdf_paths(path, Path(temporary)))
        for candidate in paths:
            with xr.open_dataset(candidate) as dataset:
                for variable in dataset.data_vars:
                    target = names.get(variable.lower())
                    if target is None:
                        continue
                    item = dataset[variable].squeeze(drop=True).to_series()
                    item.index = pd.to_datetime(item.index, utc=True)
                    series.setdefault(target, []).append(item.rename(target))
    if not series:
        raise ValueError("Variables principales ERA5-Land absentes du NetCDF.")
    # Chaque décennie est téléchargée séparément pour respecter les délais CDS.
    return pd.DataFrame({
        name: pd.concat(parts).groupby(level=0).first().sort_index()
        for name, parts in series.items()
    }).sort_index()


def read_spei3_netcdf(path: Path, *, latitude: float | None = None, longitude: float | None = None) -> pd.Series:
    """Extrait SPEI-3 du NetCDF CDS ; xarray n'est requis que pour cette lecture."""
    import xarray as xr

    with tempfile.TemporaryDirectory(prefix="era5-drought-") as temporary:
        paths = _netcdf_paths(path, Path(temporary))
        parts = []
        for candidate in paths:
            with xr.open_dataset(candidate) as dataset:
                variable = next((name for name in dataset.data_vars if "spei" in name.lower()), None)
                if variable is None:
                    continue
                values = dataset[variable]
                latitude_name = "latitude" if "latitude" in values.coords else "lat" if "lat" in values.coords else None
                longitude_name = "longitude" if "longitude" in values.coords else "lon" if "lon" in values.coords else None
                if latitude is not None and latitude_name is not None:
                    values = values.sel({latitude_name: latitude}, method="nearest")
                if longitude is not None and longitude_name is not None:
                    values = values.sel({longitude_name: longitude}, method="nearest")
                # Un fichier ERA5-Drought contient un seul mois : conserver sa
                # dimension temporelle d'une valeur, sinon ``squeeze`` perd la
                # date et rend la série impossible à indexer.
                parts.append(values.to_series())
    if not parts:
        raise ValueError("Variable SPEI absente du fichier ERA5-Drought.")
    values = pd.concat(parts).groupby(level=0).first()
    values.index = pd.to_datetime(values.index, utc=True)
    return values.rename("spei3")
