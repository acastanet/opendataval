from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
POC_SRC = REPO_ROOT / "poc" / "climat" / "empreinte-climatique" / "src"
for path in (SERVICE_SRC, POC_SRC):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from climate_fingerprint_service import (  # noqa: E402
    FingerprintSeriesInput,
    assert_fingerprint_equivalent,
    compute_fingerprint_data,
)
from empreinte_climatique.fingerprint import (  # noqa: E402
    ClimateFingerprintInput,
    build_climate_fingerprint,
)


def _series():
    daily_index = pd.date_range("1991-01-01", "2025-12-31", freq="1D", tz="UTC")
    ordinal = (daily_index.year - 1991).to_numpy(dtype=float)
    temperature = pd.Series(8 + ordinal * 0.08 + np.sin(daily_index.dayofyear / 30), index=daily_index)
    utci = pd.Series(18 + ordinal * 0.05 + np.sin(daily_index.dayofyear / 20) * 8, index=daily_index)
    precipitation = pd.Series(
        np.where(daily_index.dayofyear % 9 == 0, 0.012, 0.0008),
        index=daily_index,
    )
    wind = pd.Series(
        4 + np.where(daily_index.dayofyear % 17 == 0, 12, 0),
        index=daily_index,
    )
    monthly_index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    spei = pd.Series(
        np.sin(monthly_index.month / 2) - (monthly_index.year - 1991) * 0.01,
        index=monthly_index,
    )
    zero = pd.Series(0.0, index=daily_index)
    return temperature, utci, precipitation, spei, wind, zero


class NativeComputeEquivalenceTest(unittest.TestCase):
    def test_native_compute_matches_poc_algorithm_on_same_series(self) -> None:
        temperature, utci, precipitation, spei, wind, zero = _series()

        legacy = build_climate_fingerprint(
            ClimateFingerprintInput(temperature, utci, precipitation, spei, wind),
            tile_id="ODV-TEST",
            latitude=44.081192,
            longitude=3.641467,
        )
        # build.py corrige ce vieux libellé interne du POC avant publication.
        for row in legacy["rows"]:
            if row["id"] == "wind":
                row["source"] = "ERA5-Land"
                row["resolution"] = "0,1°"

        native = compute_fingerprint_data(
            FingerprintSeriesInput(
                temperature_c=temperature,
                utci_c=utci,
                precipitation_m=precipitation,
                spei3=spei,
                wind_u_mps=wind,
                wind_v_mps=zero,
            ),
            tile_id="ODV-TEST",
            latitude=44.081192,
            longitude=3.641467,
        )

        assert_fingerprint_equivalent(native, legacy)
        self.assertNotIn("palette", native["rows"][0])
        self.assertNotIn("summary", native)
        self.assertEqual(len(native["rows"]), 6)
        self.assertEqual(len(native["comparison"]["metrics"]), 6)

    def test_incomplete_year_remains_missing(self) -> None:
        temperature, utci, precipitation, spei, wind, zero = _series()
        temperature = temperature[temperature.index.year != 2025]
        native = compute_fingerprint_data(
            FingerprintSeriesInput(
                temperature_c=temperature,
                utci_c=utci,
                precipitation_m=precipitation,
                spei3=spei,
                wind_u_mps=wind,
                wind_v_mps=zero,
            ),
            tile_id="ODV-TEST",
            latitude=44.0,
            longitude=3.0,
        )
        last = native["rows"][0]["years"][-1]
        self.assertIsNone(last["value"])
        self.assertIsNone(last["class"])


if __name__ == "__main__":
    unittest.main()
