from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_water_service import ResultContext, WaterThroughYearInput, build_climate_result, validate_result_invariants  # noqa: E402


def inputs() -> tuple[pd.DataFrame, pd.Series]:
    index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    month = index.month.to_numpy(dtype=float)
    year = index.year.to_numpy(dtype=float)
    trend = (year - 1991) / 34
    frame = pd.DataFrame({
        "total_precipitation": 0.0025 * (1.2 + 0.25 * np.cos(month)) * (1 - 0.05 * trend),
        "volumetric_soil_water_layer_1": 0.34 - 0.02 * trend + 0.02 * np.cos(month),
        "volumetric_soil_water_layer_2": 0.36 - 0.015 * trend + 0.015 * np.cos(month),
        "volumetric_soil_water_layer_3": 0.39 - 0.01 * trend + 0.01 * np.cos(month),
        "total_evaporation": -0.0015 * (1.0 + 0.25 * np.sin(month)),
    }, index=index)
    spei = pd.Series(0.6 * np.sin(month) - 0.2 * trend, index=index)
    return frame, spei


class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        land, spei = inputs()
        cls.result = build_climate_result(
            WaterThroughYearInput(land, spei),
            context=ResultContext(
                tile_id="ODV-WATER-TEST",
                latitude=44.06462321251746,
                longitude=3.682972784135697,
                snapshot_id="SNAPSHOT-WATER-TEST",
                land_grid_latitude=44.1,
                land_grid_longitude=3.7,
                drought_grid_latitude=44.0,
                drought_grid_longitude=3.75,
                retrieved_at="2026-08-10T00:00:00Z",
                dataset_version="test",
                generated_at="2026-08-10T00:00:01Z",
            ),
        )

    def test_result_and_signals_validate_against_p4_schemas(self) -> None:
        schema_dir = REPO_ROOT / "packages" / "climate-contracts" / "schemas"
        result_schema = json.loads((schema_dir / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((schema_dir / "climate-signal.schema.json").read_text(encoding="utf-8"))
        result_schema["properties"]["signals"]["items"] = signal_schema
        Draft202012Validator(result_schema).validate(self.result)
        validator = Draft202012Validator(signal_schema)
        for signal in self.result["signals"]:
            validator.validate(signal)

    def test_comparison_metadata_and_completeness_policy_are_explicit(self) -> None:
        self.assertEqual(len(self.result["signals"]), 3)
        for signal in self.result["signals"]:
            self.assertEqual(signal["metadata"]["comparison_statistic"], "median")
            self.assertTrue(signal["metadata"]["yearly_statistic"])
        policy = next(check for check in self.result["quality"]["checks"] if check["id"] == "completeness-policy")
        self.assertEqual(policy["threshold"]["expected_months"], 420)
        self.assertEqual(policy["threshold"]["spei_months_per_year"], 12)

    def test_invariants(self) -> None:
        validate_result_invariants(self.result)
        self.assertEqual(len(self.result["signals"]), 3)


if __name__ == "__main__":
    unittest.main()
