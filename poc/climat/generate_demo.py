"""Génère un aperçu local, strictement fictif, de l'empreinte climatique."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from copernicus.process.climate_fingerprint import (
    ClimateFingerprintInput,
    build_climate_fingerprint,
    write_climate_fingerprint,
)


ROOT = Path(__file__).parent
OUTPUT = ROOT / "demo"


def main() -> None:
    daily = pd.date_range("1991-01-01", "2025-12-31", freq="1D", tz="UTC")
    years = (daily.year - 1991).to_numpy(dtype=float)
    temperature = pd.Series(9 + years * 0.075 + np.sin(daily.dayofyear / 31), index=daily)
    utci = pd.Series(17 + years * 0.06 + 8 * np.sin(daily.dayofyear / 20), index=daily)
    precipitation = pd.Series(
        np.where(daily.dayofyear % 11 == 0, 0.016, 0.0007),
        index=daily,
    )
    wind = pd.Series(4 + np.where(daily.dayofyear % 17 == 0, 11, 0), index=daily)
    months = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    spei = pd.Series(np.sin(months.month / 2) - (months.year - 1991) * 0.012, index=months)

    fingerprint = build_climate_fingerprint(
        ClimateFingerprintInput(temperature, utci, precipitation, spei, wind),
        tile_id="DEMO-FICTIVE",
        latitude=44.081192,
        longitude=3.641467,
    )
    fingerprint["provenance"]["demo"] = True
    fingerprint["provenance"]["disclaimer"] = "Données fictives : aperçu de mise en forme, sans valeur scientifique."
    json_path, svg_path = write_climate_fingerprint(OUTPUT, fingerprint)
    print(f"Aperçu créé : {json_path}")
    print(f"Aperçu créé : {svg_path}")


if __name__ == "__main__":
    main()
