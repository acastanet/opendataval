"""Génère l'empreinte réelle à partir du cache CDS local du point demandé."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from copernicus.process.assets import kelvin_to_celsius, read_csv_series, read_netcdf_series
from copernicus.process.climate_fingerprint import (
    ClimateFingerprintInput,
    build_climate_fingerprint,
    write_climate_fingerprint,
)


LATITUDE = 44.06465392551458
LONGITUDE = 3.6829349237761435
ROOT = Path("/work/real-data")
RAW = ROOT / "raw"


def main() -> None:
    temperature = kelvin_to_celsius(read_csv_series(RAW / "era5-land.csv", value_hints=("t2m",)))
    precipitation = read_csv_series(RAW / "era5-land-precipitation.csv", value_hints=("tp",)).clip(lower=0)
    u10 = read_csv_series(RAW / "era5-land-u10.csv", value_hints=("u10",))
    v10 = read_csv_series(RAW / "era5-land-v10.csv", value_hints=("v10",))
    utci = kelvin_to_celsius(read_csv_series(RAW / "utci.csv", value_hints=("utci", "universal_thermal")))
    spei3 = read_netcdf_series(RAW / "spei3.nc", value_hints=("spei",))
    wind_speed = np.sqrt(u10.pow(2) + v10.pow(2))

    fingerprint = build_climate_fingerprint(
        ClimateFingerprintInput(temperature, utci, precipitation, spei3, wind_speed),
        tile_id="GPD-44.064654-3.682935",
        latitude=LATITUDE,
        longitude=LONGITUDE,
    )
    for row in fingerprint["rows"]:
        if row["id"] == "wind":
            row["source"] = "ERA5-Land"
            row["resolution"] = "0,1°"
    fingerprint["provenance"].update({
        "demo": False,
        "requested_point": {"lat": LATITUDE, "lon": LONGITUDE},
        "grid_points": {
            "era5_land": {"lat": 44.1, "lon": 3.7, "resolution": "0,1°"},
            "era5_heat_and_drought": {"lat": 44.0, "lon": 3.75, "resolution": "0,25°"},
        },
        "datasets": ["ERA5-Land", "ERA5-HEAT", "ERA5-Drought"],
    })
    json_path, svg_path = write_climate_fingerprint(ROOT, fingerprint)
    print(json_path)
    print(svg_path)


if __name__ == "__main__":
    main()
