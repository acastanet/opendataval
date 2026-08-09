"""Télécharge UTCI et SPEI-3 pour l'empreinte climatique réelle."""

from __future__ import annotations

from pathlib import Path

from ecmwf.datastores import Client as DatastoresClient

from fetch_era5_land import cds_credentials


TARGET_DIRECTORY = Path("/work/real-data/raw")
AREA = [44.001, 3.749, 43.999, 3.751]
YEARS = [str(year) for year in range(1991, 2026)]
MONTHS = [f"{month:02d}" for month in range(1, 13)]


def retrieve(client: DatastoresClient, dataset: str, request: dict[str, object], target: Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        print(f"Réutilisation : {target}")
        return
    client.retrieve(dataset, request, str(target))
    print(target)


def main() -> None:
    url, key = cds_credentials()
    client = DatastoresClient(url=url, key=key, progress=False, timeout=300)
    retrieve(client, "derived-utci-historical-timeseries", {
        "variable": ["universal_thermal_climate_index"],
        "data_format": "csv",
        "date": "1991-01-01/2025-12-31",
        "area": AREA,
    }, TARGET_DIRECTORY / "utci.csv")
    retrieve(client, "derived-drought-historical-monthly", {
        "variable": ["standardised_precipitation_evapotranspiration_index"],
        "accumulation_period": "3",
        "version": "1_0",
        "product_type": "reanalysis",
        "dataset_type": "consolidated_dataset",
        "year": YEARS,
        "month": MONTHS,
        "area": AREA,
    }, TARGET_DIRECTORY / "spei3.nc")


if __name__ == "__main__":
    main()
