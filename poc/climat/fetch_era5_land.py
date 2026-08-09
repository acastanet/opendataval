"""Télécharge la série ERA5-Land nécessaire à l'aperçu réel du point demandé."""

from __future__ import annotations

from pathlib import Path

from ecmwf.datastores import Client as DatastoresClient


LATITUDE = 44.06465392551458
LONGITUDE = 3.6829349237761435
TARGET_DIRECTORY = Path("/work/real-data/raw")


def cds_credentials() -> tuple[str, str]:
    values = {}
    for line in Path("/work/.cdsapirc").read_text(encoding="utf-8").splitlines():
        if ":" in line:
            name, value = line.split(":", 1)
            values[name.strip()] = value.strip()
    return values["url"], values["key"]


def main() -> None:
    url, key = cds_credentials()
    client = DatastoresClient(url=url, key=key, progress=False, timeout=300)
    assets = {
        "era5-land.csv": "2m_temperature",
        "era5-land-precipitation.csv": "total_precipitation",
        "era5-land-u10.csv": "10m_u_component_of_wind",
        "era5-land-v10.csv": "10m_v_component_of_wind",
    }
    for filename, variable in assets.items():
        target = TARGET_DIRECTORY / filename
        if target.exists() and target.stat().st_size > 0:
            print(f"Réutilisation : {target}")
            continue
        client.retrieve("reanalysis-era5-land-timeseries", {
            "variable": [variable],
            "data_format": "csv",
            "date": "1991-01-01/2025-12-31",
            # L'archive ARCO utilise ses propres centres de maille. On demande une petite
            # emprise qui les contient, puis le traitement sélectionnera le point le plus proche.
            "area": [44.11, 3.68, 44.04, 3.72],
        }, str(target))
        print(target)


if __name__ == "__main__":
    main()
