from __future__ import annotations

import hashlib
import json
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from .compute import ClimateOverviewInput
from .result import ResultContext, build_climate_result

TEMPERATURE_FILENAME = "era5-land.csv"
PRECIPITATION_FILENAME = "era5-land-precipitation.csv"
SNAPSHOT_FILENAME = "climate-overview-snapshot.json"


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


def _csv_paths(path: Path, temporary: Path) -> list[Path]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temporary)
        return sorted(temporary.rglob("*.csv"))
    return [path]


def _read_csv_series(path: Path, hints: tuple[str, ...]) -> pd.Series:
    with tempfile.TemporaryDirectory(prefix="overview-csv-") as temporary:
        paths = _csv_paths(path, Path(temporary))
        if not paths:
            raise SnapshotError("Archive CSV vide")
        frame = pd.concat([pd.read_csv(candidate) for candidate in paths], ignore_index=True)
    time_column = next((str(col) for candidate in ("valid_time", "time", "datetime", "date") for col in frame.columns if str(col).lower() == candidate), None)
    if time_column is None:
        raise SnapshotError("Dimension temporelle introuvable")
    value_column = next((str(col) for col in frame.columns if any(hint in str(col).lower().replace(" ", "_") for hint in hints)), None)
    if value_column is None:
        ignored = {time_column, "latitude", "longitude", "number"}
        numeric = [str(col) for col in frame.select_dtypes(include="number").columns if str(col) not in ignored]
        if len(numeric) == 1:
            value_column = numeric[0]
    if value_column is None:
        raise SnapshotError("Variable climatique introuvable")
    index = pd.to_datetime(frame[time_column], utc=True, errors="coerce")
    values = pd.to_numeric(frame[value_column], errors="coerce")
    series = pd.Series(values.to_numpy(), index=index).dropna().sort_index()
    return series[~series.index.duplicated(keep="last")]


def read_temperature(path: Path) -> pd.Series:
    series = _read_csv_series(path, ("t2m", "2m_temperature"))
    return series.astype(float) - 273.15 if not series.empty and float(series.median()) > 100 else series.astype(float)


def read_precipitation(path: Path) -> pd.Series:
    return _read_csv_series(path, ("tp", "total_precipitation")).astype(float)


def build_snapshot_manifest(raw_directory: Path, *, snapshot_id: str, tile_id: str, latitude: float,
                            longitude: float, created_at: str, retrieved_at: str, grid_latitude: float,
                            grid_longitude: float, request_parameters: Mapping[str, Any],
                            dataset_version: str | None = None) -> dict[str, Any]:
    paths = {
        "era5-land-temperature": raw_directory / TEMPERATURE_FILENAME,
        "era5-land-precipitation": raw_directory / PRECIPITATION_FILENAME,
    }
    for path in paths.values():
        if not path.is_file():
            raise SnapshotError(f"Actif requis absent: {path}")
    if not retrieved_at:
        raise SnapshotError("retrieved_at est obligatoire")

    variables = {
        "era5-land-temperature": ["2m_temperature"],
        "era5-land-precipitation": ["total_precipitation"],
    }
    assets = []
    for asset_id, path in paths.items():
        assets.append({
            "asset_id": asset_id,
            "dataset_registry_id": "era5-land-timeseries",
            "dataset_id": "reanalysis-era5-land-timeseries",
            "provider": "Copernicus Climate Data Store / ECMWF",
            "variables": variables[asset_id],
            "period": {"start": "1991-01-01", "end": "2025-12-31"},
            "requested_spatial": {"lat": latitude, "lon": longitude},
            "represented_spatial": {"lat": grid_latitude, "lon": grid_longitude, "resolution_degrees": 0.1},
            "retrieval": {"retrieved_at": retrieved_at, "dataset_version": dataset_version, "request_parameters": dict(request_parameters)},
            "storage": {"uri": path.name, "sha256": sha256_file(path), "media_type": "text/csv"},
            "quality": {"status": "valid"},
        })
    return {
        "schema_version": "1.0",
        "snapshot_id": snapshot_id,
        "created_at": created_at,
        "requested_location": {"geometry": {"type": "Point", "coordinates": [longitude, latitude]}, "label": tile_id, "tile_id": tile_id},
        "assets": assets,
        "quality": {"status": "valid"},
        "provenance": {"generated_by": "climate_overview_service.snapshot", "asset_count": 2},
    }


def write_snapshot_manifest(raw_directory: Path, manifest: Mapping[str, Any], filename: str = SNAPSHOT_FILENAME) -> Path:
    output = raw_directory / filename
    output.write_text(json.dumps(dict(manifest), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def load_snapshot(manifest_path: Path) -> dict[str, Any]:
    snapshot = json.loads(manifest_path.read_text(encoding="utf-8"))
    if snapshot.get("schema_version") != "1.0":
        raise SnapshotError("ClimateSnapshot invalide")
    return snapshot


def verify_snapshot_assets(snapshot: Mapping[str, Any], manifest_path: Path) -> dict[str, Path]:
    assets = snapshot.get("assets")
    if not isinstance(assets, list) or len(assets) != 2:
        raise SnapshotIntegrityError("Le snapshot overview doit contenir exactement deux actifs")
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
        if sha256_file(candidate).lower() != str(storage.get("sha256", "")).lower():
            raise SnapshotIntegrityError(f"SHA-256 invalide pour {uri}")
        verified[str(asset.get("asset_id"))] = candidate
    return verified


def replay_snapshot(manifest_path: Path, *, generated_at: str | None = None) -> dict[str, Any]:
    snapshot = load_snapshot(manifest_path)
    paths = verify_snapshot_assets(snapshot, manifest_path)
    requested = snapshot["requested_location"]
    longitude, latitude = requested["geometry"]["coordinates"]
    assets = {asset["asset_id"]: asset for asset in snapshot["assets"]}
    represented = assets["era5-land-temperature"]["represented_spatial"]
    retrieval = assets["era5-land-temperature"]["retrieval"]
    return build_climate_result(
        ClimateOverviewInput(
            temperature_c=read_temperature(paths["era5-land-temperature"]),
            precipitation_m=read_precipitation(paths["era5-land-precipitation"]),
        ),
        context=ResultContext(
            tile_id=str(requested.get("tile_id") or requested.get("label")),
            latitude=float(latitude), longitude=float(longitude), snapshot_id=str(snapshot["snapshot_id"]),
            grid_latitude=float(represented["lat"]), grid_longitude=float(represented["lon"]),
            retrieved_at=str(retrieval.get("retrieved_at")), generated_at=generated_at,
        ),
    )
