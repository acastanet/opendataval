from __future__ import annotations

import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_fingerprint_service.equivalence import (  # noqa: E402
    FingerprintEquivalenceError,
    assert_fingerprint_equivalent,
    comparable_payload,
)


class GoldenTargetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden_path = (
            REPO_ROOT
            / "packages"
            / "climate-contracts"
            / "tests"
            / "golden-masters"
            / "climate-fingerprint"
            / "v4"
            / "poc-output.json"
        )
        cls.golden = json.loads(cls.golden_path.read_text(encoding="utf-8"))

    def test_p5_golden_master_is_a_valid_p6_equivalence_target(self) -> None:
        comparable = comparable_payload(self.golden)
        self.assertEqual(len(comparable["rows"]), 6)
        self.assertEqual(len(comparable["events"]), 8)
        self.assertEqual(
            comparable["comparison"]["metrics"]["temperature"]["delta"],
            1.12,
        )

    def test_equivalence_gate_detects_a_numeric_regression(self) -> None:
        changed = deepcopy(self.golden)
        changed["comparison"]["metrics"]["temperature"]["delta"] = 1.13
        with self.assertRaises(FingerprintEquivalenceError):
            assert_fingerprint_equivalent(changed, self.golden)


if __name__ == "__main__":
    unittest.main()
