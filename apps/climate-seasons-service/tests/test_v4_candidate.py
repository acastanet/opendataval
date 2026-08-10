from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

import climate_seasons_service.v4 as v4  # noqa: E402
from climate_seasons_service.compute import ThermalSeasonsContext, ThermalSeasonsInput  # noqa: E402
from climate_seasons_service.result import ResultContext  # noqa: E402
from climate_seasons_service.science import Crossings  # noqa: E402


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
        tile_id="ODV-V4-TEST",
        latitude=44.0646,
        longitude=3.6830,
        grid_latitude=44.1,
        grid_longitude=3.7,
        retrieved_at="2026-08-10T00:00:00Z",
        generated_at="2026-08-10T00:00:01Z",
    )


class ThermalSeasonsV4Test(unittest.TestCase):
    def test_common_thresholds_are_calculated_once_and_exposed_in_bootstrap(self) -> None:
        with patch.object(v4, "compute_thresholds", wraps=v4.compute_thresholds) as threshold_function:
            data = v4.compute_thermal_seasons_v4_data(ThermalSeasonsInput(synthetic_series()), context=context())
        self.assertEqual(threshold_function.call_count, 1)
        self.assertEqual(data["thresholds"]["scope"], "common_fixed_reference")
        self.assertFalse(data["thresholds"]["recomputed_per_decade"])
        self.assertFalse(data["thresholds"]["recomputed_per_bootstrap"])
        bootstrap_thresholds = data["qa"]["bootstrap"]["thresholds"]
        self.assertEqual(bootstrap_thresholds["t25_c"], data["thresholds"]["t25_c"])
        self.assertEqual(bootstrap_thresholds["t75_c"], data["thresholds"]["t75_c"])

    def test_bootstrap_is_deterministic_and_a_seed_change_does_not_move_central_estimates(self) -> None:
        first = v4.compute_thermal_seasons_v4_data(ThermalSeasonsInput(synthetic_series()), context=context())
        second = v4.compute_thermal_seasons_v4_data(ThermalSeasonsInput(synthetic_series()), context=context())
        changed = v4.compute_thermal_seasons_v4_data(
            ThermalSeasonsInput(synthetic_series()),
            context=context(),
            bootstrap_seed=v4.BOOTSTRAP_SEED + 99,
        )
        self.assertEqual(first["qa"]["bootstrap"], second["qa"]["bootstrap"])
        self.assertNotEqual(first["qa"]["bootstrap"], changed["qa"]["bootstrap"])
        self.assertEqual(first["comparison"], changed["comparison"])
        for period in (v4.EARLY_PERIOD, v4.LATE_PERIOD):
            self.assertEqual(first["decades"][period]["canonical_boundaries"], changed["decades"][period]["canonical_boundaries"])

    def test_resampling_unit_is_a_complete_year(self) -> None:
        captured: list[np.ndarray] = []
        baseline = np.arange(365, dtype=float)
        daily = {1996: baseline, 2005: baseline + 1000.0}

        def capture(values: np.ndarray, *, harmonics: int) -> np.ndarray:
            self.assertEqual(harmonics, 2)
            captured.append(values.copy())
            return values

        with patch.object(v4, "smooth_harmonic", side_effect=capture), patch.object(
            v4,
            "detect_principal_regime_crossings",
            return_value=Crossings(20.0, 120.0, 260.0, 340.0),
        ):
            record = v4._bootstrap_record(
                daily,
                sampled_years=np.asarray([1996, 1996, 2005], dtype=int),
                t25=5.0,
                t75=15.0,
            )
        self.assertTrue(record["valid"])
        np.testing.assert_allclose(captured[0], (baseline + baseline + (baseline + 1000.0)) / 3.0)

    def test_invalid_replication_is_recorded_without_aborting_bootstrap(self) -> None:
        record = v4._bootstrap_record(
            {1996: np.full(365, np.nan)},
            sampled_years=np.asarray([1996] * 10, dtype=int),
            t25=5.0,
            t75=15.0,
        )
        self.assertFalse(record["valid"])
        self.assertEqual(record["reason"], "invalid_no_daily_coverage")
        summary = v4._summarize_period_bootstrap([record])
        self.assertEqual(summary["replicates_invalid"], 1)
        self.assertEqual(summary["invalid_reasons"], {"invalid_no_daily_coverage": 1})

    def test_invalid_member_of_a_pair_never_produces_a_delta(self) -> None:
        values = {"spring_start": 10.0, "summer_start": 100.0, "autumn_start": 200.0, "winter_start": 300.0, "summer_length": 100.0}
        paired = v4._summarize_pair_bootstrap(
            [{"valid": True, "values": values}],
            [{"valid": False, "reason": "invalid_no_principal_regime"}],
        )
        self.assertEqual(paired["valid_pairs"], 0)
        self.assertEqual(paired["invalid_pairs"], 1)
        self.assertIsNone(paired["metrics"]["summer_length_change_days"]["median"])

    def test_summer_length_is_geometrically_derived_for_central_and_bootstrap_values(self) -> None:
        data = v4.compute_thermal_seasons_v4_data(ThermalSeasonsInput(synthetic_series()), context=context())
        for period in (v4.EARLY_PERIOD, v4.LATE_PERIOD):
            boundaries = data["decades"][period]["canonical_boundaries"]
            self.assertAlmostEqual(
                float(boundaries["summer_length"]),
                float(boundaries["autumn_start"]) - float(boundaries["summer_start"]),
                places=2,
            )
        comparison = data["comparison"]
        self.assertAlmostEqual(
            float(comparison["summer_length_change_days"]),
            float(comparison["autumn_start_shift_days"]) - float(comparison["summer_start_shift_days"]),
            places=2,
        )
        bootstrap = data["qa"]["bootstrap"]
        self.assertEqual(bootstrap["early"]["metrics"]["summer_length_days"]["count"], bootstrap["early"]["replicates_valid"])
        self.assertEqual(bootstrap["late"]["metrics"]["summer_length_days"]["count"], bootstrap["late"]["replicates_valid"])

    def test_bootstrap_exposes_paired_differences_and_all_required_quantiles(self) -> None:
        data = v4.compute_thermal_seasons_v4_data(ThermalSeasonsInput(synthetic_series()), context=context())
        bootstrap = data["qa"]["bootstrap"]
        self.assertEqual(bootstrap["seed"], v4.BOOTSTRAP_SEED)
        self.assertEqual(bootstrap["resampling_unit"], "year")
        self.assertTrue(bootstrap["replacement"])
        for period in ("early", "late"):
            summary = bootstrap[period]
            self.assertEqual(summary["replicates_total"], 1_000)
            self.assertEqual(summary["replicates_valid"] + summary["replicates_invalid"], 1_000)
            for metric in summary["metrics"].values():
                self.assertTrue(all(key in metric for key in ("p05", "p25", "median", "p75", "p95")))
        for metric in bootstrap["differences_late_minus_early"]["metrics"].values():
            self.assertTrue(all(key in metric for key in ("valid_pairs", "invalid_pairs", "valid_pair_rate", "proportion_negative", "proportion_zero", "proportion_positive")))

    def test_result_has_five_descriptive_signals_and_validates_contract(self) -> None:
        result = v4.build_climate_result_v4(
            ThermalSeasonsInput(synthetic_series()),
            context=ResultContext(
                tile_id="ODV-V4-TEST",
                latitude=44.0646,
                longitude=3.6830,
                snapshot_id="SNAPSHOT-V4-TEST",
                grid_latitude=44.1,
                grid_longitude=3.7,
                retrieved_at="2026-08-10T00:00:00Z",
                generated_at="2026-08-10T00:00:01Z",
            ),
        )
        self.assertEqual(result["method"], v4.METHOD_V4)
        self.assertEqual(result["quality"]["status"], "valid")
        self.assertEqual(len(result["signals"]), 5)
        self.assertTrue(all(signal["claim_level"] == "descriptive" for signal in result["signals"]))
        self.assertTrue(all(signal["metadata"]["calculation_scale"] == "decadal_daily_climatology" for signal in result["signals"]))

        schema_dir = REPO_ROOT / "packages" / "climate-contracts" / "schemas"
        result_schema = json.loads((schema_dir / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((schema_dir / "climate-signal.schema.json").read_text(encoding="utf-8"))
        result_schema["properties"]["signals"]["items"] = signal_schema
        Draft202012Validator(result_schema).validate(result)


if __name__ == "__main__":
    unittest.main()
