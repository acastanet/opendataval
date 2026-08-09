from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_fingerprint_service.legacy_metadata import legacy_poc_acquisition_metadata  # noqa: E402


class LegacyMetadataTest(unittest.TestCase):
    def test_historical_request_parameters_match_poc_fetch_contract(self) -> None:
        metadata = legacy_poc_acquisition_metadata(
            44.06465392551458,
            3.6829349237761435,
            retrieved_at="2026-08-09T20:00:00Z",
        )

        land = metadata["era5-land-temperature"]
        self.assertEqual(land["represented_spatial"]["lat"], 44.1)
        self.assertEqual(land["represented_spatial"]["lon"], 3.7)
        self.assertEqual(land["request_parameters"]["date"], "1991-01-01/2025-12-31")
        self.assertEqual(land["request_parameters"]["variable"], ["2m_temperature"])
        self.assertEqual(land["request_parameters"]["data_format"], "csv")
        self.assertEqual(land["request_parameters"]["area"], [44.101, 3.699, 44.099, 3.701])

        utci = metadata["era5-heat-utci"]
        self.assertEqual(utci["represented_spatial"]["lat"], 44.0)
        self.assertEqual(utci["represented_spatial"]["lon"], 3.75)
        self.assertEqual(utci["request_parameters"]["area"], [44.001, 3.749, 43.999, 3.751])

        drought = metadata["era5-drought-spei3"]
        self.assertEqual(drought["dataset_version"], "1_0")
        self.assertEqual(drought["request_parameters"]["accumulation_period"], "3")
        self.assertEqual(drought["request_parameters"]["version"], "1_0")
        self.assertEqual(drought["request_parameters"]["product_type"], "reanalysis")
        self.assertEqual(drought["request_parameters"]["dataset_type"], "consolidated_dataset")
        self.assertEqual(len(drought["request_parameters"]["year"]), 35)
        self.assertEqual(len(drought["request_parameters"]["month"]), 12)

    def test_retrieved_at_is_never_invented(self) -> None:
        with self.assertRaises(ValueError):
            legacy_poc_acquisition_metadata(44.0, 3.0, retrieved_at="")


if __name__ == "__main__":
    unittest.main()
