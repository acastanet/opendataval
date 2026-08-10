from __future__ import annotations

import hashlib
import json
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from .compute import WaterThroughYearInput
from .result import ResultContext, build_climate_result

LAND_FILENAME = "era5-land-monthly.nc"
DROUGHT_FILENAME = "era5-drought-spei3.nc"


class SnapshotError(ValueError):
    pass


class SnapshotIntegrityError(SnapshotError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _netcdf_paths(path: Path, temporary: Path) -> list[Path]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temporary)
        return sorted(candidate for candidate in temporary.rglob("*") if candidate.suffix.lower() in {".nc", ".nc4", ".netcdf"})
    return [path]


def read_land_monthly(path: Path) -> pd.DataFrame:
    import xarray as xr

    names = {
        "tp": "total_precipitation",
        "total_precipitation": "total_precipitation",
        "swvl1": "volumetric_soil_water_layer_1",
        "volumetric_soil_water_layer_1": "volumetric_soil_water_layer_1",
        "swvl2": "volumetric_soil_water_layer_2",
        "volumetric_soil_water_layer_2": "volumetric_soil_water_layer_2",
        "swvl3": "volumetric_soil_water_layer_3",
        "volumetric_soil_water_layer_3": "volumetric_soil_water_layer_3",
        "e": "total_evaporation",
        "total_evaporation": "total_evaporation",
    }
    series: dict[str, list[pd.Series]] = {}
    with tempfile.TemporaryDirectory(prefix="water-land-") as temporary:
        paths = sorted(path.glob("era5-land-monthly-*.nc")) if path.is_dir() else _netcdf_paths(path, Path(temporary))
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
        raise SnapshotError("Variables principales ERA5-Land absentes")
    return pd.DataFrame({name: pd.concat(parts).groupby(level=0).first().sort_index() for name, parts in series.items()}).sort_index()


def read_spei3(path: Path, *, latitude: float | None = None, longitude: float | None = None) -> pd.Series:
    import xarray as xr

    parts: list[pd.Series] = []
    with tempfile.TemporaryDirectory(prefix="water-drought-") as temporary:
        for candidate in _netcdf_paths(path, Path(temporary)):
            with xr.open_dataset(candidate) as dataset:
                variable = next((name for name in dataset.data_vars if "spei" in name.lower()), None)
                if variable is None:
                    continue
                values = dataset[variable]
                lat_name = "latitude" if "latitude" in values.coords else "lat" if "lat" in values.coords else None
                lon_name = "longitude" if "longitude" in values.coords else "lon" if "lon" in values.coords else None
                if latitude is not None and lat_name:
                    values = values.sel({lat_name: latitude}, method="nearest")
                if longitude is not None and lon_name:
                    values = values.sel({lon_name: longitude}, method="nearest")
                item = values.squeeze(drop=True).to_series()
                if not isinstance(item, pd.Series):
                    item = pd.Series([float(item)])
                parts.append(item)
    if not parts:
        raise SnapshotError("Variable SPEI absente")
    values = pd.concat(parts).groupby(level=0).first()
    values.index = pd.to_datetime(values.index, utc=True)
    return values.rename("spei3")


def build_snapshot_manifest(
    raw_directory: Path,
    *,
    snapshot_id: str,
    tile_id: str,
    latitude: float,
    longitude: float,
    created_at: str,
    retrieved_at: str,
    land_grid_latitude: float,
    land_grid_longitude: float,
    drought_grid_latitude: float,
    drought_grid_longitude: float,
    land_request_parameters: Mapping[str, Any],
    drought_request_parameters: Mapping[str, Any],
    dataset_version: str | None = None,
) -> dict[str, Any]:
    land_path, drought_path = raw_directory / LAND_FILENAME, raw_directory / DROUGHT_FILENAME
    for path in (land_path, drought_path):
        if not path.is_file():
            raise SnapshotError(f"Actif requis absent: {path}")
    if not retrieved_at:
        raise SnapshotError("retrieved_at est obligatoire")

    def asset(asset_id: str, filename: str, registry_id: str, dataset_id: str, variables: list[str], grid_lat: float, grid_lon: float, resolution: float, request: Mapping[str, Any]) -> dict[str, Any]:
        path = raw_directory / filename
        return {
            "asset_id": asset_id,
            "dataset_registry_id": registry_id,
            "dataset_id": dataset_id,
            "provider": "Copernicus Climate Data Store / ECMWF",
            "variables": variables,
            "period": {"start": "1991-01-01", "end": "2025-12-31"},
            "requested_spatial": {"lat": latitude, "lon": longitude},
            "represented_spatial": {"lat": grid_lat, "lon": grid_lon, "resolution_degrees": resolution},
            "retrieval": {"retrieved_at": retrieved_at, "dataset_version": dataset_version, "request_parameters": dict(request)},
            "storage": {"uri": filename, "sha256": sha256_file(path), "media_type": "application/x-netcdf"},
            "quality": {"status": "valid"},
        }

    assets = [
        asset(
            "era5-land-water-monthly",
            LAND_FILENAME,
            "era5-land-monthly-means",
            "reanalysis-era5-land-monthly-means",
            ["total_precipitation", "volumetric_soil_water_layer_1", "volumetric_soil_water_layer_2", "volumetric_soil_water_layer_3", "total_evaporation"],
            land_grid_latitude,
            land_grid_longitude,
            0.1,
            land_request_parameters,
        ),
        asset(
            "era5-drought-spei3",
            DROUGHT_FILENAME,
            "era5-drought-historical-monthly",
            "derived-drought-historical-monthly",
            ["standardised_precipitation_evapotranspiration_index"],
            drought_grid_latitude,
            drought_grid_longitude,
            0.25,
            drought_request_parameters,
        ),
    ]
    return {
        "schema_version": "1.0",
        "snapshot_id": snapshot_id,
        "created_at": created_at,
        "requested_location": {"geometry": {"type": "Point", "coordinates": [longitude, latitude]}, "label": tile_id, "tile_id": tile_id},
        "assets": assets,
        "quality": {"status": "valid"},
        "provenance": {"generated_by": "climate_water_service.snapshot", "asset_count": 2},
    }


def write_snapshot_manifest(raw_directory: Path, manifest: Mapping[str, Any], filename: str = "climate-snapshot.json") -> Path:
    output = raw_directory / filename
    output.write_text(json.dumps(dict(manifest), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def load_snapshot(manifest_path: Path) -> dict[str, Any]:
    result = json.loads(manifest_path.read_text(encoding="utf-8"))
    if result.get("schema_version") != "1.0":
        raise SnapshotError("ClimateSnapshot invalide")
    return result


def verify_snapshot_assets(snapshot: Mapping[str, Any], manifest_path: Path) -> dict[str, Path]:
    assets = snapshot.get("assets")
    if not isinstance(assets, list) or len(assets) != 2:
        raise SnapshotIntegrityError("Le snapshot eau doit contenir exactement deux actifs")
    root = manifest_path.resolve().parent
    verified: dict[str, Path] = {}
    for asset in assets:
        storage = asset.get("storage") or {}
        uri = storage.get("uri")
        if not isinstance(uri, str) or not uri or "://" in uri or uri.startswith("file:"):
            raise SnapshotError("storage.uri doit être relative")
        candidate = (root / uri).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise SnapshotError("storage.uri sort du répertoire du snapshot") from exc
        if not candidate.is_file():
            raise SnapshotIntegrityError(f"Actif absent: {candidate}")
        actual, expected = sha256_file(candidate), storage.get("sha256")
        if not isinstance(expected, str) or actual.lower() != expected.lower():
            raise SnapshotIntegrityError(f"SHA-256 invalide pour {uri}")
        verified[str(asset.get("asset_id"))] = candidate
    return verified


def replay_snapshot(manifest_path: Path, *, generated_at: str | None = None) -> dict:
    snapshot = load_snapshot(manifest_path)
    paths = verify_snapshot_assets(snapshot, manifest_path)
    requested = snapshot["requested_location"]
    longitude, latitude = requested["geometry"]["coordinates"]
    assets = {asset["asset_id"]: asset for asset in snapshot["assets"]}
    land_asset, drought_asset = assets["era5-land-water-monthly"], assets["era5-drought-spei3"]
    land_rep, drought_rep = land_asset["represented_spatial"], drought_asset["represented_spatial"]
    retrieval = land_asset["retrieval"]
    series = WaterThroughYearInput(
        era5_land_monthly=read_land_monthly(paths["era5-land-water-monthly"]),
        spei3=read_spei3(paths["era5-drought-spei3"], latitude=float(drought_rep["lat"]), longitude=float(drought_rep["lon"])),
    )
    return build_climate_result(
        series,
        context=ResultContext(
            tile_id=str(requested.get("tile_id") or requested.get("label")),
            latitude=float(latitude),
            longitude=float(longitude),
            snapshot_id=str(snapshot["snapshot_id"]),
            land_grid_latitude=float(land_rep["lat"]),
            land_grid_longitude=float(land_rep["lon"]),
            drought_grid_latitude=float(drought_rep["lat"]),
            drought_grid_longitude=float(drought_rep["lon"]),
            retrieved_at=str(retrieval.get("retrieved_at")),
            dataset_version=retrieval.get("dataset_version"),
            generated_at=generated_at,
        ),
    )
