from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path

import pandas as pd
import xarray as xr


def _csv_paths(path: Path, temporary_dir: Path) -> list[Path]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temporary_dir)
        return sorted(temporary_dir.rglob("*.csv"))
    return [path]


def _value_column(frame: pd.DataFrame, hints: tuple[str, ...]) -> str:
    ignored = {"time", "valid_time", "date", "latitude", "longitude", "number"}
    for column in frame.columns:
        normalisee = str(column).lower().replace(" ", "_")
        if any(hint in normalisee for hint in hints):
            return str(column)
    numeriques = [
        str(column)
        for column in frame.select_dtypes(include="number").columns
        if str(column).lower() not in ignored
    ]
    if len(numeriques) == 1:
        return numeriques[0]
    raise ValueError("Variable climatique introuvable dans le fichier reçu")


def _time_column(frame: pd.DataFrame) -> str:
    for candidate in ("valid_time", "time", "datetime", "date"):
        for column in frame.columns:
            if str(column).lower() == candidate:
                return str(column)
    raise ValueError("Dimension temporelle introuvable dans le fichier reçu")


def read_csv_series(path: Path, *, value_hints: tuple[str, ...]) -> pd.Series:
    with tempfile.TemporaryDirectory(prefix="copernicus-csv-") as temporary:
        paths = _csv_paths(path, Path(temporary))
        if not paths:
            raise ValueError("Archive Copernicus sans fichier CSV")
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
    series_parts: list[pd.Series] = []
    with tempfile.TemporaryDirectory(prefix="copernicus-netcdf-") as temporary:
        paths = _netcdf_paths(path, Path(temporary))
        if not paths:
            raise ValueError("Archive Copernicus sans fichier NetCDF")
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
                    raise ValueError("Variable UTCI introuvable dans le NetCDF")
                frame = dataset[variable].to_dataframe(name="value").reset_index()
                time_column = _time_column(frame)
                index = pd.to_datetime(frame[time_column], utc=True, errors="coerce")
                values = pd.to_numeric(frame["value"], errors="coerce")
                series_parts.append(pd.Series(values.to_numpy(), index=index).dropna())
    series = pd.concat(series_parts).sort_index()
    return series.groupby(level=0).first()


def kelvin_to_celsius(series: pd.Series) -> pd.Series:
    if series.empty:
        return series.astype(float)
    valeurs = series.astype(float)
    return valeurs - 273.15 if float(valeurs.median()) > 100 else valeurs
