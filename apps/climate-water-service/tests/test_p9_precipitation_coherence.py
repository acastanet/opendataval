from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]

FINGERPRINT_GOLDEN = (
    REPO_ROOT
    / "packages"
    / "climate-contracts"
    / "tests"
    / "golden-masters"
    / "climate-fingerprint"
    / "v4"
    / "poc-output.json"
)
WATER_GOLDEN = REPO_ROOT / "poc" / "climat" / "bilan eau" / "output" / "water-through-year.json"


class PrecipitationCoherenceP9Test(unittest.TestCase):
    def test_golden_discrepancy_is_mean_vs_median_not_a_factor_four_unit_error(self) -> None:
        fingerprint = json.loads(FINGERPRINT_GOLDEN.read_text(encoding="utf-8"))
        water = json.loads(WATER_GOLDEN.read_text(encoding="utf-8"))

        row = next(item for item in fingerprint["rows"] if item["id"] == "precipitation")
        yearly = {int(item["year"]): float(item["value"]) for item in row["years"]}
        early = np.asarray([yearly[year] for year in range(1996, 2006)], dtype=float)
        late = np.asarray([yearly[year] for year in range(2016, 2026)], dtype=float)

        mean_change = 100.0 * (float(np.mean(late)) - float(np.mean(early))) / float(np.mean(early))
        median_change = 100.0 * (float(np.median(late)) - float(np.median(early))) / float(np.median(early))
        water_change = float(water["comparison"]["annual_precip_change_pct"])

        self.assertAlmostEqual(mean_change, -5.0008, places=3)
        self.assertAlmostEqual(float(fingerprint["comparison"]["metrics"]["precipitation"]["relative_pct"]), -5.0, places=1)
        self.assertAlmostEqual(median_change, -9.2265, places=3)
        self.assertLess(abs(water_change - median_change), 0.1)
        self.assertGreater(abs(water_change - mean_change), 3.0)


if __name__ == "__main__":
    unittest.main()
