from __future__ import annotations

import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_water_service import assert_water_equivalent, build_signals  # noqa: E402

GOLDEN = REPO_ROOT / "poc" / "climat" / "bilan eau" / "output" / "water-through-year.json"


class GoldenTargetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden = json.loads(GOLDEN.read_text(encoding="utf-8"))

    def test_expected_comparisons_and_quality(self) -> None:
        comp = self.golden["comparison"]
        self.assertEqual(comp["annual_precip_change_pct"], -9.19)
        self.assertEqual(comp["summer_soil_water_change_mm"], -11.78)
        self.assertEqual(comp["dry_months_change"], -1.0)
        for metric in ("precipitation_mm", "soil_water_0_100_mm", "actual_evapotranspiration_mm", "spei3"):
            block = self.golden["quality"]["variables"][metric]
            self.assertEqual(block["valid_months"], 420)
            self.assertEqual(block["expected_months"], 420)

    def test_three_native_signals_match_p5_semantics(self) -> None:
        signals = build_signals(self.golden)
        self.assertEqual(len(signals), 3)
        directions = {signal["metric"]: signal["direction"] for signal in signals}
        self.assertEqual(directions["annual_precip_change_pct"], "lower")
        self.assertEqual(directions["summer_soil_water_change_mm"], "lower")
        self.assertEqual(directions["dry_months_change"], "less_frequent")

    def test_comparator_detects_numeric_drift(self) -> None:
        changed = deepcopy(self.golden)
        changed["comparison"]["annual_precip_change_pct"] += 0.01
        with self.assertRaises(AssertionError):
            assert_water_equivalent(changed, self.golden)


if __name__ == "__main__":
    unittest.main()
