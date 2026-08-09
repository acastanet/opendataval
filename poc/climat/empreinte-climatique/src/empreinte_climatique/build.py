"""Assemblage des séries CDS et écriture des livrables publiables."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .assets import kelvin_to_celsius, read_csv_series, read_netcdf_series
from .fetch import GridPoint, nearest_grid_point
from .fingerprint import (
    ClimateFingerprintInput,
    build_climate_fingerprint,
    write_climate_fingerprint_v4,
)


def _preview_html(fingerprint: dict[str, object]) -> str:
    template_path = Path(__file__).parent / "templates" / "index.html"
    template = template_path.read_text(encoding="utf-8")
    point = fingerprint.get("point", {})
    latitude = point.get("lat", "") if isinstance(point, dict) else ""
    longitude = point.get("lon", "") if isinstance(point, dict) else ""
    return (
        template
        .replace("{{LATITUDE}}", str(latitude).replace(".", ","))
        .replace("{{LONGITUDE}}", str(longitude).replace(".", ","))
        .replace("{{SUMMARY}}", str(fingerprint.get("summary", "")))
    )


def write_delivery(output_directory: Path, fingerprint: dict[str, object]) -> None:
    """Écrit le JSON, les trois SVG et la page HTML depuis un contrat existant."""
    output_directory.mkdir(parents=True, exist_ok=True)
    write_climate_fingerprint_v4(output_directory, fingerprint)
    html = _preview_html(fingerprint)
    (output_directory / "climate-fingerprint-v4.html").write_text(html, encoding="utf-8")
    (output_directory / "index.html").write_text(html, encoding="utf-8")


def build_from_raw_assets(
    latitude: float,
    longitude: float,
    raw_directory: Path,
    output_directory: Path,
    *,
    tile_id: str | None = None,
    grids: dict[str, GridPoint] | None = None,
) -> dict[str, object]:
    """Calcule et publie l'empreinte depuis un répertoire de fichiers CDS."""
    temperature = kelvin_to_celsius(read_csv_series(raw_directory / "era5-land.csv", value_hints=("t2m",)))
    precipitation = read_csv_series(
        raw_directory / "era5-land-precipitation.csv",
        value_hints=("tp",),
    ).clip(lower=0)
    u10 = read_csv_series(raw_directory / "era5-land-u10.csv", value_hints=("u10",))
    v10 = read_csv_series(raw_directory / "era5-land-v10.csv", value_hints=("v10",))
    utci = kelvin_to_celsius(
        read_csv_series(raw_directory / "utci.csv", value_hints=("utci", "universal_thermal"))
    )
    spei3 = read_netcdf_series(raw_directory / "spei3.nc", value_hints=("spei",))
    wind_speed = np.sqrt(u10.pow(2) + v10.pow(2))

    fingerprint = build_climate_fingerprint(
        ClimateFingerprintInput(temperature, utci, precipitation, spei3, wind_speed),
        tile_id=tile_id or f"POINT-{latitude:.6f}-{longitude:.6f}",
        latitude=latitude,
        longitude=longitude,
    )
    grid_points = grids or {
        "era5_land": nearest_grid_point(latitude, longitude, 0.1),
        "derived": nearest_grid_point(latitude, longitude, 0.25),
    }
    for row in fingerprint["rows"]:
        if row["id"] == "wind":
            row["source"] = "ERA5-Land"
            row["resolution"] = "0,1°"
    fingerprint["provenance"].update({
        "demo": False,
        "requested_point": {"lat": latitude, "lon": longitude},
        "grid_points": {
            name: {
                "lat": point.latitude,
                "lon": point.longitude,
                "resolution": point.resolution,
            }
            for name, point in grid_points.items()
        },
        "datasets": ["ERA5-Land", "ERA5-HEAT", "ERA5-Drought"],
    })

    write_delivery(output_directory, fingerprint)
    return fingerprint
