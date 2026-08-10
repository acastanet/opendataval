from __future__ import annotations

import hashlib
import json
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from .compute import ThermalSeasonsInput
from .result import ResultContext, build_climate_result

ASSET_ID = "era5-land-temperature"
FILENAME = "era5-land.csv"
DATASET_REGISTRY_ID = "era5-land-timeseries"
DATASET_ID = "reanalysis-era5-land-timeseries"
VARIABLE = "2m_temperature"


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


def _csv_paths(path: Path, temporary_dir: Path) -> list[Path]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temporary_dir)
        return sorted(temporary_dir.rglob("*.csv"))
    return [path]


def read_temperature(path: Path) -> pd.Series:
    with tempfile.TemporaryDirectory(prefix="thermal-seasons-csv-") as temporary:
        paths = _csv_paths(path, Path(temporary))
        if not paths:
            raise SnapshotError("Archive ERA5-Land vide")
        frames = [pd.read_csv(candidate) for candidate in paths]
    frame = pd.concat(frames, ignore_index=True)
    time_column = next(
        (str(column) for candidate in ("valid_time", "time", "datetime", "date") for column in frame.columns if str(column).lower() == candidate),
        None,
    )
    if time_column is None:
        raise SnapshotError("Dimension temporelle introuvable dans era5-land.csv")
    value_column = next(
        (
            str(column)
            for column in frame.columns
            if "t2m" in str(column).lower().replace(" ", "_")
            or "2m_temperature" in str(column).lower().replace(" ", "_")
        ),
        None,
    )
    if value_column is None:
        ignored = {time_column, "latitude", "longitude", "number"}
        numeric = [str(column) for column in frame.select_dtypes(include="number").columns if str(column) not in ignored]
        if len(numeric) == 1:
            value_column = numeric[0]
    if value_column is None:
        raise SnapshotError("2m_temperature introuvable dans era5-land.csv")
    index = pd.to_datetime(frame[time_column], utc=True, errors="coerce")
    values = pd.to_numeric(frame[value_column], errors="coerce")
    series = pd.Series(values.to_numpy(), index=index).dropna().sort_index()
    series = series[~series.index.duplicated(keep="last")]
    return series - 273.15 if not series.empty and float(series.median()) > 100 else series.astype(float)


def build_snapshot_manifest(
    raw_directory: Path,
    *,
    snapshot_id: str,
    tile_id: str,
    latitude: float,
    longitude: float,
    created_at: str,
    retrieved_at: str,
    grid_latitude: float,
    grid_longitude: float,
    request_parameters: Mapping[str, Any],
    dataset_version: str | None = None,
) -> dict[str, Any]:
    path = raw_directory / FILENAME
    if not path.is_file():
        raise SnapshotError(f"Actif requis absent: {path}")
    if not retrieved_at:
        raise SnapshotError("retrieved_at est obligatoire")
    if not isinstance(request_parameters, Mapping):
        raise SnapshotError("request_parameters est obligatoire")
    return {
        "schema_version": "1.0",
        "snapshot_id": snapshot_id,
        "created_at": created_at,
        "requested_location": {
            "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
            "label": tile_id,
            "tile_id": tile_id,
        },
        "assets": [
            {
                "asset_id": ASSET_ID,
                "dataset_registry_id": DATASET_REGISTRY_ID,
                "dataset_id": DATASET_ID,
                "provider": "Copernicus Climate Data Store / ECMWF",
                "variables": [VARIABLE],
                "period": {"start": "1991-01-01", "end": "2025-12-31"},
                "requested_spatial": {"lat": latitude, "lon": longitude},
                "represented_spatial": {"lat": grid_latitude, "lon": grid_longitude, "resolution_degrees": 0.1},
                "retrieval": {
                    "retrieved_at": retrieved_at,
                    "dataset_version": dataset_version,
                    "request_parameters": dict(request_parameters),
                },
                "storage": {
                    "uri": FILENAME,
                    "sha256": sha256_file(path),
                    "media_type": "text/csv",
                },
                "quality": {"status": "valid"},
            }
        ],
        "quality": {"status": "valid"},
        "provenance": {
            "generated_by": "climate_seasons_service.snapshot",
            "asset_count": 1,
        },
    }


def write_snapshot_manifest(raw_directory: Path, manifest: Mapping[str, Any], filename: str = "climate-snapshot.json") -> Path:
    output = raw_directory / filename
    output.write_text(json.dumps(dict(manifest), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def load_snapshot(manifest_path: Path) -> dict[str, Any]:
    snapshot = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(snapshot, dict) or snapshot.get("schema_version") != "1.0":
        raise SnapshotError("ClimateSnapshot invalide")
    return snapshot


def verify_snapshot_asset(snapshot: Mapping[str, Any], manifest_path: Path) -> Path:
    assets = snapshot.get("assets")
    if not isinstance(assets, list) or len(assets) != 1:
        raise SnapshotIntegrityError("Le snapshot saisons doit contenir exactement un actif")
    asset = assets[0]
    if asset.get("asset_id") != ASSET_ID:
        raise SnapshotIntegrityError(f"asset_id attendu: {ASSET_ID}")
    storage = asset.get("storage") or {}
    uri = storage.get("uri")
    if not isinstance(uri, str) or not uri or "://" in uri or uri.startswith("file:"):
        raise SnapshotError("storage.uri doit être relative")
    root = manifest_path.resolve().parent
    candidate = (root / uri).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise SnapshotError("storage.uri sort du répertoire du snapshot") from exc
    if not candidate.is_file():
        raise SnapshotIntegrityError(f"Actif absent: {candidate}")
    expected = storage.get("sha256")
    actual = sha256_file(candidate)
    if not isinstance(expected, str) or expected.lower() != actual.lower():
        raise SnapshotIntegrityError(f"SHA-256 invalide: attendu {expected}, obtenu {actual}")
    return candidate


def replay_snapshot(manifest_path: Path, *, generated_at: str | None = None) -> dict[str, Any]:
    snapshot = load_snapshot(manifest_path)
    asset_path = verify_snapshot_asset(snapshot, manifest_path)
    requested = snapshot.get("requested_location") or {}
    geometry = requested.get("geometry") or {}
    coordinates = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coordinates, list) or len(coordinates) != 2:
        raise SnapshotError("Le service saisons attend un Point")
    longitude, latitude = coordinates
    tile_id = requested.get("tile_id") or requested.get("label")
    asset = snapshot["assets"][0]
    represented = asset.get("represented_spatial") or {}
    retrieval = asset.get("retrieval") or {}
    return build_climate_result(
        ThermalSeasonsInput(temperature_c=read_temperature(asset_path)),
        context=ResultContext(
            tile_id=str(tile_id),
            latitude=float(latitude),
            longitude=float(longitude),
            snapshot_id=str(snapshot["snapshot_id"]),
            grid_latitude=float(represented["lat"]),
            grid_longitude=float(represented["lon"]),
            retrieved_at=str(retrieval.get("retrieved_at")),
            generated_at=generated_at,
        ),
    )
