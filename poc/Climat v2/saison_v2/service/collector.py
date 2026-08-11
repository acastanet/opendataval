"""Collecte ERA5-Land minimale et mise en cache par point de grille."""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

START_DATE = "1991-01-01"
END_DATE = "2025-12-31"
DATASET = "reanalysis-era5-land-timeseries"
logger = logging.getLogger(__name__)


class CoordinatesError(ValueError):
    """Coordonnées absentes, non finies ou hors du domaine WGS84."""


class CredentialsError(RuntimeError):
    """Configuration Copernicus CDS absente."""


class CollectionError(RuntimeError):
    """Échec de la collecte auprès de Copernicus."""


@dataclass(frozen=True)
class CollectedAsset:
    path: Path
    grid_latitude: float
    grid_longitude: float
    retrieved_at: str
    sha256: str


_locks_guard = threading.Lock()
_grid_locks: dict[str, threading.Lock] = {}


def validate_coordinates(latitude: float, longitude: float) -> tuple[float, float]:
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise CoordinatesError("La latitude et la longitude doivent être des nombres finis.")
    if not -90 <= latitude <= 90:
        raise CoordinatesError("La latitude doit être comprise entre -90 et 90.")
    if not -180 <= longitude <= 180:
        raise CoordinatesError("La longitude doit être comprise entre -180 et 180.")
    return latitude, longitude


def nearest_grid_point(latitude: float, longitude: float) -> tuple[float, float]:
    validate_coordinates(latitude, longitude)
    return round(round(latitude / 0.1) * 0.1, 6), round(round(longitude / 0.1) * 0.1, 6)


def _grid_key(latitude: float, longitude: float) -> str:
    raw = f"{latitude:+06.1f}_{longitude:+07.1f}"
    return raw.replace("+", "p").replace("-", "m").replace(".", "_")


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        return _grid_locks.setdefault(key, threading.Lock())


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_cached(data_path: Path, metadata_path: Path, grid_lat: float, grid_lon: float) -> CollectedAsset | None:
    if not data_path.is_file() or data_path.stat().st_size == 0 or not metadata_path.is_file():
        return None
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        actual_hash = _sha256(data_path)
        if metadata["sha256"] != actual_hash:
            return None
        if float(metadata["grid_latitude"]) != grid_lat or float(metadata["grid_longitude"]) != grid_lon:
            return None
        return CollectedAsset(data_path, grid_lat, grid_lon, str(metadata["retrieved_at"]), actual_hash)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError, OSError):
        return None


def _credentials() -> tuple[str, str]:
    url = os.getenv("COPERNICUS_CDS_URL", "https://cds.climate.copernicus.eu/api").strip()
    key = os.getenv("COPERNICUS_CDS_KEY", "").strip()
    if not key:
        raise CredentialsError("COPERNICUS_CDS_KEY n’est pas configurée sur le serveur.")
    return url, key


def _request(grid_lat: float, grid_lon: float) -> dict[str, Any]:
    margin = 0.001
    return {
        "variable": ["2m_temperature"],
        "data_format": "csv",
        "date": f"{START_DATE}/{END_DATE}",
        "area": [grid_lat + margin, grid_lon - margin, grid_lat - margin, grid_lon + margin],
    }


def collect_temperature(latitude: float, longitude: float, cache_root: Path) -> CollectedAsset:
    """Retourne le CSV de température du point de grille, téléchargé une seule fois."""

    grid_lat, grid_lon = nearest_grid_point(latitude, longitude)
    key = _grid_key(grid_lat, grid_lon)
    directory = cache_root / "era5-land" / key
    data_path = directory / "era5-land.csv"
    metadata_path = directory / "metadata.json"

    with _lock_for(key):
        cached = _read_cached(data_path, metadata_path, grid_lat, grid_lon)
        if cached is not None:
            return cached

        url, token = _credentials()
        try:
            from ecmwf.datastores import Client
        except ImportError as exc:
            raise CollectionError("Le client Copernicus n’est pas installé.") from exc

        directory.mkdir(parents=True, exist_ok=True)
        temporary = directory / "era5-land.csv.part"
        temporary.unlink(missing_ok=True)
        try:
            Client(url=url, key=token, progress=False, timeout=600).retrieve(
                DATASET,
                _request(grid_lat, grid_lon),
                str(temporary),
            )
            if not temporary.is_file() or temporary.stat().st_size == 0:
                raise CollectionError("Copernicus n’a renvoyé aucune donnée.")
            temporary.replace(data_path)
        except CredentialsError:
            raise
        except Exception as exc:
            logger.exception("Échec de la collecte Copernicus pour la maille %s", key)
            raise CollectionError("Copernicus n’a pas pu fournir les données demandées.") from exc
        finally:
            temporary.unlink(missing_ok=True)

        retrieved_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        digest = _sha256(data_path)
        metadata_path.write_text(
            json.dumps(
                {
                    "dataset": DATASET,
                    "period": {"start": START_DATE, "end": END_DATE},
                    "grid_latitude": grid_lat,
                    "grid_longitude": grid_lon,
                    "retrieved_at": retrieved_at,
                    "sha256": digest,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return CollectedAsset(data_path, grid_lat, grid_lon, retrieved_at, digest)
