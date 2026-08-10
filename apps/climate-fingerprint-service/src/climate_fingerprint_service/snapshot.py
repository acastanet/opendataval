from __future__ import annotations

import hashlib
import json
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd
import xarray as xr

from .compute import FingerprintSeriesInput
from .result import FingerprintContext, build_climate_result


class SnapshotError(ValueError):
    pass


class SnapshotIntegrityError(SnapshotError):
    pass


@dataclass(frozen=True)
class AssetSpec:
    asset_id: str
    filename: str
    dataset_registry_id: str
    dataset_id: str
    provider: str
    variables: tuple[str, ...]
    media_type: str
    reader: str
    value_hints: tuple[str, ...]


ASSET_SPECS: tuple[AssetSpec, ...] = (
    AssetSpec(
        "era5-land-temperature",
        "era5-land.csv",
        "era5-land-timeseries",
        "reanalysis-era5-land-timeseries",
        "Copernicus Climate Data Store / ECMWF",
        ("2m_temperature",),
        "text/csv",
        "csv",
        ("t2m", "2m_temperature"),
    ),
    AssetSpec(
        "era5-land-precipitation",
        "era5-land-precipitation.csv",
        "era5-land-timeseries",
        "reanalysis-era5-land-timeseries",
        "Copernicus Climate Data Store / ECMWF",
        ("total_precipitation",),
        "text/csv",
        "csv",
        ("tp", "total_precipitation"),
    ),
    AssetSpec(
        "era5-land-u10",
        "era5-land-u10.csv",
        "era5-land-timeseries",
        "reanalysis-era5-land-timeseries",
        "Copernicus Climate Data Store / ECMWF",
        ("10m_u_component_of_wind",),
        "text/csv",
        "csv",
        ("u10", "10m_u_component_of_wind"),
    ),
    AssetSpec(
        "era5-land-v10",
        "era5-land-v10.csv",
        "era5-land-timeseries",
        "reanalysis-era5-land-timeseries",
        "Copernicus Climate Data Store / ECMWF",
        ("10m_v_component_of_wind",),
        "text/csv",
        "csv",
        ("v10", "10m_v_component_of_wind"),
    ),
    AssetSpec(
        "era5-heat-utci",
        "utci.csv",
        "era5-heat-utci-timeseries",
        "derived-utci-historical-timeseries",
        "Copernicus Climate Data Store",
        ("universal_thermal_climate_index",),
        "text/csv",
        "csv",
        ("utci", "universal_thermal"),
    ),
    AssetSpec(
        "era5-drought-spei3",
        "spei3.nc",
        "era5-drought-historical-monthly",
        "derived-drought-historical-monthly",
        "Copernicus Climate Data Store",
        ("standardised_precipitation_evapotranspiration_index",),
        "application/x-netcdf",
        "netcdf",
        ("spei", "standardised_precipitation_evapotranspiration_index"),
    ),
)

_SPEC_BY_ID = {spec.asset_id: spec for spec in ASSET_SPECS}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _csv_paths(path: Path, temporary_dir: Path) -> list[Path]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temporary_dir)
        return sorted(temporary_dir.rglob("*.csv"))
    return [path]


def _value_column(frame: pd.DataFrame, hints: tuple[str, ...]) -> str:
    ignored = {"time", "valid_time", "date", "datetime", "latitude", "longitude", "number"}
    for column in frame.columns:
        normalized = str(column).lower().replace(" ", "_")
        if any(hint in normalized for hint in hints):
            return str(column)
    numeric = [
        str(column)
        for column in frame.select_dtypes(include="number").columns
        if str(column).lower() not in ignored
    ]
    if len(numeric) == 1:
        return numeric[0]
    raise SnapshotError("Variable climatique introuvable dans l'actif CSV")


def _time_column(frame: pd.DataFrame) -> str:
    for candidate in ("valid_time", "time", "datetime", "date"):
        for column in frame.columns:
            if str(column).lower() == candidate:
                return str(column)
    raise SnapshotError("Dimension temporelle introuvable dans l'actif")


def read_csv_series(path: Path, *, value_hints: tuple[str, ...]) -> pd.Series:
    with tempfile.TemporaryDirectory(prefix="climate-snapshot-csv-") as temporary:
        paths = _csv_paths(path, Path(temporary))
        if not paths:
            raise SnapshotError("Archive CSV vide")
        frames = [pd.read_csv(csv_path) for csv_path in paths]
    frame = pd.concat(frames, ignore_index=True)
    time_column = _time_column(frame)
    value_column = _value_column(frame, value_hints)
    index = pd.to_datetime(frame[time_column], utc=True, errors="coerce")
    values = pd.to_numeric(frame[value_column], errors="coerce")
    series = pd.Series(values.to_numpy(), index=index).dropna().sort_index()
    return series[~series.index.duplicated(keep="last")]


def _netcdf_paths(path: Path, temporary_dir: Path) -> list[Path]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temporary_dir)
        return sorted(
            candidate
            for candidate in temporary_dir.rglob("*")
            if candidate.is_file() and candidate.suffix.lower() in {".nc", ".nc4", ".netcdf"}
        )
    return [path]


def read_netcdf_series(path: Path, *, value_hints: tuple[str, ...]) -> pd.Series:
    parts: list[pd.Series] = []
    with tempfile.TemporaryDirectory(prefix="climate-snapshot-netcdf-") as temporary:
        paths = _netcdf_paths(path, Path(temporary))
        if not paths:
            raise SnapshotError("Archive NetCDF vide")
        for netcdf_path in paths:
            with xr.open_dataset(netcdf_path) as dataset:
                variable = next(
                    (
                        name
                        for name in dataset.data_vars
                        if any(hint in name.lower() for hint in value_hints)
                    ),
                    None,
                )
                if variable is None and len(dataset.data_vars) == 1:
                    variable = next(iter(dataset.data_vars))
                if variable is None:
                    raise SnapshotError("Variable climatique introuvable dans l'actif NetCDF")
                frame = dataset[variable].to_dataframe(name="value").reset_index()
                time_column = _time_column(frame)
                index = pd.to_datetime(frame[time_column], utc=True, errors="coerce")
                values = pd.to_numeric(frame["value"], errors="coerce")
                parts.append(pd.Series(values.to_numpy(), index=index).dropna())
    if not parts:
        raise SnapshotError("Aucune série lisible dans l'actif NetCDF")
    series = pd.concat(parts).sort_index()
    return series.groupby(level=0).first()


def kelvin_to_celsius(series: pd.Series) -> pd.Series:
    if series.empty:
        return series.astype(float)
    values = series.astype(float)
    return values - 273.15 if float(values.median()) > 100 else values


def _asset_map(snapshot: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    assets = snapshot.get("assets")
    if not isinstance(assets, list):
        raise SnapshotError("ClimateSnapshot.assets doit être une liste")
    result: dict[str, Mapping[str, Any]] = {}
    for asset in assets:
        if not isinstance(asset, Mapping):
            raise SnapshotError("Actif ClimateSnapshot invalide")
        asset_id = asset.get("asset_id")
        if not isinstance(asset_id, str) or not asset_id:
            raise SnapshotError("asset_id manquant")
        if asset_id in result:
            raise SnapshotError(f"asset_id dupliqué: {asset_id}")
        result[asset_id] = asset
    return result


def resolve_asset_path(manifest_path: Path, asset: Mapping[str, Any]) -> Path:
    storage = asset.get("storage")
    if not isinstance(storage, Mapping):
        raise SnapshotError("storage manquant")
    uri = storage.get("uri")
    if not isinstance(uri, str) or not uri:
        raise SnapshotError("storage.uri manquant")
    if "://" in uri or uri.startswith("file:"):
        raise SnapshotError("Le replay local P6 exige une URI relative au manifest")
    root = manifest_path.resolve().parent
    candidate = (root / uri).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise SnapshotError("storage.uri sort du répertoire du snapshot") from exc
    return candidate


def verify_snapshot_assets(snapshot: Mapping[str, Any], manifest_path: Path) -> dict[str, Path]:
    assets = _asset_map(snapshot)
    expected_ids = {spec.asset_id for spec in ASSET_SPECS}
    missing = expected_ids - set(assets)
    if missing:
        raise SnapshotIntegrityError(f"Actifs requis manquants: {sorted(missing)}")

    paths: dict[str, Path] = {}
    for asset_id in expected_ids:
        asset = assets[asset_id]
        path = resolve_asset_path(manifest_path, asset)
        if not path.is_file():
            raise SnapshotIntegrityError(f"Actif absent: {asset_id} -> {path}")
        storage = asset.get("storage") or {}
        expected_hash = storage.get("sha256")
        actual_hash = sha256_file(path)
        if not isinstance(expected_hash, str) or actual_hash.lower() != expected_hash.lower():
            raise SnapshotIntegrityError(
                f"SHA-256 invalide pour {asset_id}: attendu {expected_hash}, obtenu {actual_hash}"
            )
        paths[asset_id] = path
    return paths


def load_snapshot(path: Path) -> dict[str, Any]:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(snapshot, dict):
        raise SnapshotError("ClimateSnapshot doit être un objet JSON")
    if snapshot.get("schema_version") != "1.0":
        raise SnapshotError("ClimateSnapshot.schema_version doit valoir 1.0")
    if not isinstance(snapshot.get("snapshot_id"), str):
        raise SnapshotError("snapshot_id manquant")
    return snapshot


def load_series_from_snapshot(manifest_path: Path) -> tuple[dict[str, Any], FingerprintSeriesInput]:
    snapshot = load_snapshot(manifest_path)
    paths = verify_snapshot_assets(snapshot, manifest_path)

    temperature = kelvin_to_celsius(
        read_csv_series(paths["era5-land-temperature"], value_hints=_SPEC_BY_ID["era5-land-temperature"].value_hints)
    )
    precipitation = read_csv_series(
        paths["era5-land-precipitation"], value_hints=_SPEC_BY_ID["era5-land-precipitation"].value_hints
    ).clip(lower=0)
    u10 = read_csv_series(paths["era5-land-u10"], value_hints=_SPEC_BY_ID["era5-land-u10"].value_hints)
    v10 = read_csv_series(paths["era5-land-v10"], value_hints=_SPEC_BY_ID["era5-land-v10"].value_hints)
    utci = kelvin_to_celsius(
        read_csv_series(paths["era5-heat-utci"], value_hints=_SPEC_BY_ID["era5-heat-utci"].value_hints)
    )
    spei3 = read_netcdf_series(
        paths["era5-drought-spei3"], value_hints=_SPEC_BY_ID["era5-drought-spei3"].value_hints
    )

    return snapshot, FingerprintSeriesInput(
        temperature_c=temperature,
        utci_c=utci,
        precipitation_m=precipitation,
        spei3=spei3,
        wind_u_mps=u10,
        wind_v_mps=v10,
    )


def _represented_context(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    represented: dict[str, Any] = {"assets": {}}
    for asset_id, asset in _asset_map(snapshot).items():
        spatial = asset.get("represented_spatial")
        if isinstance(spatial, Mapping):
            represented["assets"][asset_id] = dict(spatial)
    return represented


def _retrieval_context(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    retrieval: dict[str, Any] = {}
    for asset_id, asset in _asset_map(snapshot).items():
        block = asset.get("retrieval")
        if not isinstance(block, Mapping):
            raise SnapshotError(f"retrieval manquant dans le snapshot : {asset_id}")
        retrieved_at = block.get("retrieved_at")
        request_parameters = block.get("request_parameters")
        if not isinstance(retrieved_at, str) or not retrieved_at:
            raise SnapshotError(f"retrieval.retrieved_at manquant : {asset_id}")
        if not isinstance(request_parameters, Mapping):
            raise SnapshotError(f"retrieval.request_parameters manquant : {asset_id}")
        retrieval[asset_id] = {
            "retrieved_at": retrieved_at,
            "dataset_version": block.get("dataset_version"),
            "request_parameters": dict(request_parameters),
        }
    return retrieval


def replay_snapshot(manifest_path: Path, *, generated_at: str | None = None) -> dict[str, Any]:
    snapshot, series = load_series_from_snapshot(manifest_path)
    requested = snapshot.get("requested_location")
    if not isinstance(requested, Mapping):
        raise SnapshotError("requested_location manquant")
    geometry = requested.get("geometry")
    if not isinstance(geometry, Mapping) or geometry.get("type") != "Point":
        raise SnapshotError("climate-fingerprint-service P6 attend un Point")
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        raise SnapshotError("Coordonnées Point invalides")
    longitude, latitude = coordinates
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise SnapshotError("Coordonnées Point non numériques")
    tile_id = requested.get("tile_id") or requested.get("label")
    if not isinstance(tile_id, str) or not tile_id:
        raise SnapshotError("tile_id requis pour le replay")

    return build_climate_result(
        series,
        context=FingerprintContext(
            tile_id=tile_id,
            latitude=float(latitude),
            longitude=float(longitude),
            snapshot_id=str(snapshot["snapshot_id"]),
            represented=_represented_context(snapshot),
            retrieval=_retrieval_context(snapshot),
            generated_at=generated_at,
        ),
    )


def build_snapshot_manifest(
    raw_directory: Path,
    *,
    snapshot_id: str,
    tile_id: str,
    latitude: float,
    longitude: float,
    created_at: str,
    acquisition_metadata: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Construit un manifest honnête depuis six actifs déjà acquis.

    Les métadonnées de récupération sont obligatoires : le service refuse de
    fabriquer une date de récupération, une version de dataset ou une requête CDS.
    Le manifest doit être écrit dans ``raw_directory`` pour conserver des URI
    relatives portables.
    """
    assets: list[dict[str, Any]] = []
    for spec in ASSET_SPECS:
        path = raw_directory / spec.filename
        if not path.is_file():
            raise SnapshotError(f"Actif requis absent: {path}")
        metadata = acquisition_metadata.get(spec.asset_id)
        if not isinstance(metadata, Mapping):
            raise SnapshotError(f"Métadonnées d'acquisition manquantes: {spec.asset_id}")
        retrieved_at = metadata.get("retrieved_at")
        request_parameters = metadata.get("request_parameters")
        if not isinstance(retrieved_at, str) or not retrieved_at:
            raise SnapshotError(f"retrieved_at manquant: {spec.asset_id}")
        if not isinstance(request_parameters, Mapping):
            raise SnapshotError(f"request_parameters manquant: {spec.asset_id}")
        assets.append(
            {
                "asset_id": spec.asset_id,
                "dataset_registry_id": spec.dataset_registry_id,
                "dataset_id": spec.dataset_id,
                "provider": spec.provider,
                "variables": list(spec.variables),
                "period": {
                    "start": str(metadata.get("period_start", "1991-01-01")),
                    "end": str(metadata.get("period_end", "2025-12-31")),
                },
                "requested_spatial": {"lat": latitude, "lon": longitude},
                "represented_spatial": dict(metadata.get("represented_spatial") or {}),
                "retrieval": {
                    "retrieved_at": retrieved_at,
                    "dataset_version": metadata.get("dataset_version"),
                    "request_parameters": dict(request_parameters),
                },
                "storage": {
                    "uri": spec.filename,
                    "sha256": sha256_file(path),
                    "media_type": spec.media_type,
                },
                "quality": {
                    "status": str(metadata.get("quality_status", "valid")),
                    "checks": list(metadata.get("quality_checks") or []),
                },
            }
        )

    return {
        "schema_version": "1.0",
        "snapshot_id": snapshot_id,
        "created_at": created_at,
        "requested_location": {
            "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
            "label": tile_id,
            "tile_id": tile_id,
        },
        "assets": assets,
        "quality": {
            "status": "valid" if all(asset["quality"]["status"] == "valid" for asset in assets) else "partial"
        },
        "provenance": {
            "generated_by": "climate_fingerprint_service.snapshot",
            "policy": "retrieval metadata supplied by acquisition layer; file hashes computed locally",
        },
    }


def write_snapshot_manifest(raw_directory: Path, manifest: Mapping[str, Any], *, filename: str = "climate-snapshot.json") -> Path:
    path = raw_directory / filename
    path.write_text(json.dumps(dict(manifest), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
