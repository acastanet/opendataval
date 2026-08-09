from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator, RefResolver

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_fingerprint_service import (  # noqa: E402
    FingerprintContext,
    FingerprintSeriesInput,
    build_climate_result,
    resolve_json_pointer,
    validate_result_invariants,
)


def _native_result():
    daily_index = pd.date_range("1991-01-01", "2025-12-31", freq="1D", tz="UTC")
    ordinal = (daily_index.year - 1991).to_numpy(dtype=float)
    monthly_index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
    series = FingerprintSeriesInput(
        temperature_c=pd.Series(8 + ordinal * 0.08 + np.sin(daily_index.dayofyear / 30), index=daily_index),
        utci_c=pd.Series(18 + ordinal * 0.05 + np.sin(daily_index.dayofyear / 20) * 8, index=daily_index),
        precipitation_m=pd.Series(np.where(daily_index.dayofyear % 9 == 0, 0.012, 0.0008), index=daily_index),
        spei3=pd.Series(np.sin(monthly_index.month / 2) - (monthly_index.year - 1991) * 0.01, index=monthly_index),
        wind_u_mps=pd.Series(4 + np.where(daily_index.dayofyear % 17 == 0, 12, 0), index=daily_index),
        wind_v_mps=pd.Series(0.0, index=daily_index),
    )
    return build_climate_result(
        series,
        context=FingerprintContext(
            tile_id="ODV-TEST",
            latitude=44.081192,
            longitude=3.641467,
            snapshot_id="SNAPSHOT-P6-TEST",
            represented={
                "grid_points": {
                    "era5_land": {"lat": 44.1, "lon": 3.6, "resolution": "0,1°"},
                    "derived": {"lat": 44.0, "lon": 3.75, "resolution": "0,25°"},
                }
            },
            generated_at="2026-08-09T21:30:00Z",
        ),
    )


class NativeContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = _native_result()
        cls.schemas = REPO_ROOT / "packages" / "climate-contracts" / "schemas"

    def test_native_result_has_six_valid_signals(self) -> None:
        self.assertEqual(self.result["quality"]["status"], "valid")
        self.assertEqual(len(self.result["signals"]), 6)
        self.assertNotIn("legacy_source_blob_sha", self.result["provenance"])
        self.assertEqual(
            self.result["provenance"]["generated_by"],
            "climate_fingerprint_service.result",
        )

    def test_evidence_resolves_to_signal_values(self) -> None:
        for signal in self.result["signals"]:
            pointer = signal["evidence"][0]["result_pointer"]
            self.assertEqual(resolve_json_pointer(self.result, pointer), signal["value"])

    def test_cross_document_invariants(self) -> None:
        self.assertEqual(validate_result_invariants(self.result), [])

    def test_climate_signal_schema(self) -> None:
        schema = json.loads((self.schemas / "climate-signal.schema.json").read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema)
        for signal in self.result["signals"]:
            validator.validate(signal)

    def test_climate_result_schema(self) -> None:
        result_schema = json.loads((self.schemas / "climate-result.schema.json").read_text(encoding="utf-8"))
        signal_schema = json.loads((self.schemas / "climate-signal.schema.json").read_text(encoding="utf-8"))
        base_uri = self.schemas.resolve().as_uri() + "/"
        resolver = RefResolver(
            base_uri=base_uri,
            referrer=result_schema,
            store={
                "climate-signal.schema.json": signal_schema,
                base_uri + "climate-signal.schema.json": signal_schema,
            },
        )
        Draft202012Validator(result_schema, resolver=resolver).validate(self.result)


if __name__ == "__main__":
    unittest.main()
