"""Téléchargement ERA5-Land en réutilisant le pipeline Copernicus existant.

Réutilise les primitives de ``poc/climat/empreinte-climatique`` (fetch, assets)
conformément à la contrainte §3.3 (ne pas dupliquer le pipeline). On ne
télécharge QUE ``2m_temperature`` (ERA5-Land, grille 0,1°) — le seul actif
nécessaire aux saisons thermiques.
"""

from __future__ import annotations

from pathlib import Path

import sys

# Le pipeline existant est un package voisin ; on l'importe via son chemin.
_PIPELINE_ROOT = Path(__file__).resolve().parents[2] / "empreinte-climatique" / "src"
if str(_PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_ROOT))

from empreinte_climatique.fetch import (  # noqa: E402
    download_climate_assets as _download_climate_assets,
)
from empreinte_climatique.assets import (  # noqa: E402
    kelvin_to_celsius,
    read_csv_series,
)


def download_era5_land(
    latitude: float,
    longitude: float,
    raw_directory: Path,
    *,
    credentials_path: Path | None = None,
) -> dict:
    """Télécharge (avec cache) ``era5-land.csv`` (2m_temperature) pour le point."""
    return _download_climate_assets(
        latitude,
        longitude,
        raw_directory,
        credentials_path=credentials_path,
    )


def read_temperature(raw_directory: Path) -> object:
    """Lit le CSV ERA5-Land et convertit K -> °C."""
    return kelvin_to_celsius(
        read_csv_series(raw_directory / "era5-land.csv", value_hints=("t2m",))
    )
