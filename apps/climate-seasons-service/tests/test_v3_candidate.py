from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service.compute import ThermalSeasonsContext, ThermalSeasonsInput  # noqa: E402
from climate_seasons_service.principal_regime import detect_principal_regime_crossings  # noqa: E402
from climate_seasons_service.result import ResultContext  # noqa: E402
from climate_seasons_service.science import compute_thresholds, detect_crossings  # noqa: E402
from climate_seasons_service.sensitivity import smooth_circular_moving_average, smooth_harmonic  # noqa: E402
from climate_seasons_service.v3 import METHOD_V3, build_climate_result_v3, compute_thermal_seasons_v3_data  # noqa: E402


def synthetic_series() -> pd.Series:
    index = pd.date_range("1991-01-01", "2025-12-31 23:00", freq="h", tz="UTC")
    day = index.dayofyear.to_numpy(dtype=float)
    hour = index.hour.to_numpy(dtype=float)
    year = index.year.to_numpy(dtype=int)
    values = (
        10.0
        - 10.0 * np.cos(2.0 * np.pi * (day - 15.0) / 365.0)
        + 0.4 * np.cos(4.0 * np.pi * (day - 40.0) / 365.0)
        + (year - 1991) * 0.025
        + 1.5 * np.sin(2.0 * np.pi * hour / 24.0)
    )
    return pd.Series(values, index=index)


def context() -> ThermalSeasonsContext:
    return ThermalSeasonsContext(
        tile_id="ODV-V3-TEST",
        latitude=44.0646,
        longitude=3.6830,
        grid_latitude=44.1,
        grid_longitude=3.7,
        retrieved_at="2026-08-10T00:00:00Z",
        generated_at="2026-08-10T00:00:01Z",
    )


class PrincipalRegimeDetectorTest(unittest.TestCase):
    def test_detector_ignores_early_false_autumn_crossing_before_annual_peak(self) -> None:
        values = np.zeros(365, dtype=float)
        values[79:300] = 10.0
        values[119:260] = 20.0
        values[159:165] = 14.0
        values[199] = 25.0

        legacy = detect_crossings(values, 5.0, 15.0)
        principal = detect_principal_regime_crossings(values, 5.0, 15.0)
        self.assertIsNotNone(legacy)
        self.assertIsNotNone(principal)
        assert legacy is not None and principal is not None
        self.assertLess(legacy.autumn_start, 180.0)
        self.assertGreater(principal.autumn_start, 240.0)
        self.assertLess(principal.summer_start, principal.autumn_start)

    def test_clean_cycle_harmonic_and_ma31_principal_regimes_remain_close(self) -> None:
        day = np.arange(1, 366, dtype=float)
        values = 10.0 - 10.0 * np.cos(2.0 * np.pi * (day - 15.0) / 365.0)
        t25, t75 = compute_thresholds(values)
        harmonic = detect_principal_regime_crossings(smooth_harmonic(values, harmonics=2), t25, t75)
        moving = detect_principal_regime_crossings(smooth_circular_moving_average(values, window=31), t25, t75)
        self.assertIsNotNone(harmonic)
        self.assertIsNotNone(moving)
        assert harmonic is not None and moving is not None
        spread = max(
            abs(float(getattr(harmonic, field)) - float(getattr(moving, field)))
            for field in ("spring_start", "summer_start", "autumn_start", "winter_start")
        )
        self.assertLess(spread, 3.0)


class ThermalSeasonsV3Test(unittest.TestCase):
    def test_clean_cycle_produces_comparable_decades_and_five_signals(self) -> None:
        data = compute_thermal_seasons_v3_data(ThermalSeasonsInput(synthetic_series()), context=context())
        self.assertEqual(data["method"]["boundary_detection"], "principal_interval_containing_annual_maximum")
        self.assertEqual(data["quality"]["annual_ok"], 30)
        self.assertEqual(data["quality"]["early_ok"], 10)
        self.assertEqual(data["quality"]["late_ok"], 10)
        self.assertLess(data["qa"]["smoother_sensitivity"]["study_distribution"]["max"], 3.0)

        result = build_climate_result_v3(
            ThermalSeasonsInput(synthetic_series()),
            context=ResultContext(
                tile_id="ODV-V3-TEST",
                latitude=44.0646,
                longitude=3.6830,
                snapshot_id="SNAPSHOT-V3-TEST",
                grid_latitude=44.1,
                grid_longitude=3.7,
                retrieved_at="2026-08-10T00:00:00Z",
                generated_at="2026-08-10T00:00:01Z",
            ),
        )
        self.assertEqual(result["method"], METHOD_V3)
        self.assertEqual(len(result["signals"]), 5)
        self.assertTrue(
            all(
                signal["metadata"]["boundary_detection"] == "principal_interval_containing_annual_maximum"
                for signal in result["signals"]
            )
        )

        schema_dir = REPO_ROOT / "packages" / "climate-contracts" / "schemas"
        result_schema = json.loads((schema_dir / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((schema_dir / "climate-signal.schema.json").read_text(encoding="utf-8"))
        result_schema["properties"]["signals"]["items"] = signal_schema
        Draft202012Validator(result_schema).validate(result)


if __name__ == "__main__":
    unittest.main()
