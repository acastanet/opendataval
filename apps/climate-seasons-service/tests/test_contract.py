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

from climate_seasons_service import (  # noqa: E402
    ResultContext,
    ThermalSeasonsInput,
    build_climate_result,
    validate_result_invariants,
)


def _series() -> pd.Series:
    index = pd.date_range("1991-01-01", "2025-12-31 23:00", freq="h", tz="UTC")
    day = index.dayofyear.to_numpy(dtype=float)
    year = index.year.to_numpy(dtype=float)
    values = (
        10.0
        - 10.0 * np.cos(2.0 * np.pi * (day - 15.0) / 365.0)
        + (year - 1991.0) * 0.03
        + 1.5 * np.sin(2.0 * np.pi * index.hour.to_numpy(dtype=float) / 24.0)
    )
    return pd.Series(values, index=index)


class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = build_climate_result(
            ThermalSeasonsInput(_series()),
            context=ResultContext(
                tile_id="ODV-TEST",
                latitude=44.06465392551458,
                longitude=3.6829349237761435,
                snapshot_id="SNAPSHOT-SEASONS-TEST",
                grid_latitude=44.1,
                grid_longitude=3.7,
                retrieved_at="2026-08-10T00:00:00Z",
                generated_at="2026-08-10T00:00:01Z",
            ),
        )

    def test_result_and_signals_validate_against_p4_schemas(self) -> None:
        schema_dir = REPO_ROOT / "packages" / "climate-contracts" / "schemas"
        result_schema = json.loads((schema_dir / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((schema_dir / "climate-signal.schema.json").read_text(encoding="utf-8"))
        # ClimateResult utilise un $ref relatif. Pour une validation hermétique en
        # CI, on injecte le schéma local au lieu de laisser jsonschema tenter une
        # récupération réseau sans URI de base.
        result_schema["properties"]["signals"]["items"] = signal_schema
        Draft202012Validator(result_schema).validate(self.result)
        validator = Draft202012Validator(signal_schema)
        for signal in self.result["signals"]:
            validator.validate(signal)

    def test_result_invariants_and_evidence(self) -> None:
        validate_result_invariants(self.result)
        self.assertEqual(len(self.result["signals"]), 5)
        self.assertEqual(self.result["method"], {"id": "thermal-seasons", "version": "1.0.0"})


if __name__ == "__main__":
    unittest.main()
