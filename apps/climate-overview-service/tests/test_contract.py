from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_overview_service import ClimateOverviewInput, ResultContext, build_climate_result, validate_result_invariants  # noqa: E402


def series() -> ClimateOverviewInput:
    index = pd.date_range("1991-01-01", "2020-12-31", freq="D", tz="UTC")
    day = index.dayofyear.to_numpy(dtype=float)
    temp = 10.0 - 8.0 * np.cos(2 * np.pi * (day - 15) / 365.25)
    precip = np.full(len(index), 0.001)
    return ClimateOverviewInput(pd.Series(temp, index=index), pd.Series(precip, index=index))


class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = build_climate_result(series(), context=ResultContext(
            tile_id="ODV-OVERVIEW-TEST", latitude=44.06462321251746, longitude=3.682972784135697,
            snapshot_id="SNAPSHOT-OVERVIEW-TEST", grid_latitude=44.1, grid_longitude=3.7,
            retrieved_at="2026-08-10T00:00:00Z", generated_at="2026-08-10T00:00:01Z",
        ))

    def test_result_and_signals_validate_p4(self) -> None:
        schema_dir = REPO_ROOT / "packages" / "climate-contracts" / "schemas"
        result_schema = json.loads((schema_dir / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((schema_dir / "climate-signal.schema.json").read_text(encoding="utf-8"))
        result_schema["properties"]["signals"]["items"] = signal_schema
        Draft202012Validator(result_schema).validate(self.result)
        validator = Draft202012Validator(signal_schema)
        for signal in self.result["signals"]:
            validator.validate(signal)

    def test_invariants_and_seven_signals(self) -> None:
        validate_result_invariants(self.result)
        self.assertEqual(len(self.result["signals"]), 7)
        self.assertEqual(self.result["quality"]["status"], "valid")


if __name__ == "__main__":
    unittest.main()
