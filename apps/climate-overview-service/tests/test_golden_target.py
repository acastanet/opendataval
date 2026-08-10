from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_overview_service import build_signals, comparable_payload  # noqa: E402

GOLDEN = REPO_ROOT / "poc" / "climat" / "general" / "climate" / "overview" / "outputs" / "zone_test_utilisateur_climate-overview.json"


class GoldenTargetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden = json.loads(GOLDEN.read_text(encoding="utf-8"))

    def test_p5_targets_are_stable(self) -> None:
        annual = self.golden["annual"]
        self.assertEqual(annual["mean_temperature_c"], 11.1)
        self.assertEqual(annual["precipitation_mm"], 1327.3)
        self.assertEqual(annual["warmest_month"]["name"], "Juillet")
        self.assertEqual(annual["coldest_month"]["name"], "Janvier")
        self.assertEqual(annual["wettest_month"]["name"], "Octobre")
        self.assertEqual(annual["driest_month"]["name"], "Juillet")
        self.assertEqual(len(self.golden["monthly"]), 12)
        self.assertEqual(self.golden["representativity"]["grid_cell_count"], 1)

    def test_only_seven_canonical_signals_are_emitted(self) -> None:
        signals = build_signals(self.golden)
        self.assertEqual(len(signals), 7)
        definitions = {signal["definition_id"] for signal in signals}
        self.assertNotIn("frost_days_mean", definitions)
        self.assertNotIn("hot_days_30c_mean", definitions)
        self.assertNotIn("tropical_nights_20c_mean", definitions)

    def test_comparable_payload_excludes_legacy_extreme_counters(self) -> None:
        payload = comparable_payload(self.golden)
        self.assertNotIn("frost_days_mean", payload["annual"])
        self.assertNotIn("hot_days_30c_mean", payload["annual"])
        self.assertNotIn("tropical_nights_20c_mean", payload["annual"])


if __name__ == "__main__":
    unittest.main()
