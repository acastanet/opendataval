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
from climate_seasons_service.result import ResultContext  # noqa: E402
from climate_seasons_service.v2 import (  # noqa: E402
    METHOD_V2,
    build_climate_result_v2,
    compute_thermal_seasons_v2_data,
)


def synthetic_series(*, noisy_year: int | None = None, invalid_year: int | None = None) -> pd.Series:
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
    if noisy_year is not None:
        mask = year == noisy_year
        values[mask] += 6.0 * np.sin(2.0 * np.pi * day[mask] / 7.0)
    if invalid_year is not None:
        values[year == invalid_year] = 10.0
    return pd.Series(values, index=index)


def context() -> ThermalSeasonsContext:
    return ThermalSeasonsContext(
        tile_id="ODV-V2-TEST",
        latitude=44.0646,
        longitude=3.6830,
        grid_latitude=44.1,
        grid_longitude=3.7,
        retrieved_at="2026-08-10T00:00:00Z",
        generated_at="2026-08-10T00:00:01Z",
    )


class ThermalSeasonsV2Test(unittest.TestCase):
    def test_clean_cycle_uses_harmonic_canonical_and_independent_control(self) -> None:
        data = compute_thermal_seasons_v2_data(
            ThermalSeasonsInput(synthetic_series()),
            context=context(),
        )
        self.assertEqual(data["method"]["canonical_smoothing"], "harmonic_2")
        self.assertEqual(data["method"]["control_smoothing"], "circular_moving_average_31d")
        self.assertEqual(data["quality"]["annual_ok"], 30)
        self.assertEqual(data["quality"]["annual_partial"], 0)
        self.assertEqual(data["quality"]["annual_rejected"], 0)
        self.assertLess(data["qa"]["smoother_sensitivity"]["study_distribution"]["max"], 3.0)
        self.assertEqual(data["qa"]["fit_rmse"]["reference_distribution"]["count"], 30)

    def test_rmse_outlier_is_partial_and_excluded_from_decade_comparison(self) -> None:
        data = compute_thermal_seasons_v2_data(
            ThermalSeasonsInput(synthetic_series(noisy_year=2022)),
            context=context(),
        )
        entry = next(item for item in data["annual"] if item["year"] == 2022)
        self.assertEqual(entry["status"], "partial")
        self.assertIn("fit_rmse_above_reference_p95", entry["qa_reasons"])
        self.assertGreater(entry["fit_rmse_c"], data["qa"]["fit_rmse"]["threshold_c"])
        self.assertEqual(data["quality"]["late_ok"], 9)

    def test_next_year_spring_must_pass_its_own_qa_before_winter_length(self) -> None:
        data = compute_thermal_seasons_v2_data(
            ThermalSeasonsInput(synthetic_series(invalid_year=2025)),
            context=context(),
        )
        y2025 = next(item for item in data["annual"] if item["year"] == 2025)
        y2024 = next(item for item in data["annual"] if item["year"] == 2024)
        self.assertNotEqual(y2025["status"], "ok")
        self.assertIsNone(y2024["winter_length_days"])
        self.assertEqual(y2024["winter_length_status"], "next_year_spring_not_qa_validated")

    def test_v2_result_and_signals_keep_version_and_common_contract(self) -> None:
        result = build_climate_result_v2(
            ThermalSeasonsInput(synthetic_series()),
            context=ResultContext(
                tile_id="ODV-V2-TEST",
                latitude=44.0646,
                longitude=3.6830,
                snapshot_id="SNAPSHOT-V2-TEST",
                grid_latitude=44.1,
                grid_longitude=3.7,
                retrieved_at="2026-08-10T00:00:00Z",
                generated_at="2026-08-10T00:00:01Z",
            ),
        )
        self.assertEqual(result["method"], METHOD_V2)
        self.assertEqual(len(result["signals"]), 5)
        self.assertTrue(all(signal["metadata"]["comparison_statistic"] == "median" for signal in result["signals"]))

        schema_dir = REPO_ROOT / "packages" / "climate-contracts" / "schemas"
        result_schema = json.loads((schema_dir / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((schema_dir / "climate-signal.schema.json").read_text(encoding="utf-8"))
        result_schema["properties"]["signals"]["items"] = signal_schema
        Draft202012Validator(result_schema).validate(result)


if __name__ == "__main__":
    unittest.main()
