from __future__ import annotations

import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service import assert_thermal_seasons_equivalent, build_signals  # noqa: E402

FIXTURE = REPO_ROOT / "poc" / "climat" / "saisons" / "tests" / "fixtures" / "thermal-seasons-fixture.json"


class GoldenTargetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_real_fixture_has_expected_p5_comparisons(self) -> None:
        comparison = self.golden["comparison"]
        self.assertEqual(comparison["spring_start_shift_days"], -1.66)
        self.assertEqual(comparison["summer_start_shift_days"], -17.69)
        self.assertEqual(comparison["autumn_start_shift_days"], 15.27)
        self.assertEqual(comparison["winter_start_shift_days"], 5.59)
        self.assertEqual(comparison["summer_length_change_days"], 28.66)
        self.assertEqual(self.golden["quality"]["annual_ok"], 29)
        self.assertEqual(self.golden["quality"]["annual_total"], 30)

    def test_five_native_signals_match_fixture_semantics(self) -> None:
        signals = build_signals(self.golden)
        directions = {signal["metric"]: signal["direction"] for signal in signals}
        self.assertEqual(len(signals), 5)
        self.assertEqual(directions["spring_start_shift_days"], "earlier")
        self.assertEqual(directions["summer_start_shift_days"], "earlier")
        self.assertEqual(directions["autumn_start_shift_days"], "later")
        self.assertEqual(directions["winter_start_shift_days"], "later")
        self.assertEqual(directions["summer_length_change_days"], "longer")

    def test_comparator_detects_numeric_drift(self) -> None:
        changed = deepcopy(self.golden)
        changed["comparison"]["summer_length_change_days"] += 0.01
        with self.assertRaises(AssertionError):
            assert_thermal_seasons_equivalent(changed, self.golden)


if __name__ == "__main__":
    unittest.main()
