from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_fingerprint_service.compute import _rank  # noqa: E402


class RankPolicyTest(unittest.TestCase):
    def test_ties_use_standard_competition_ranking(self) -> None:
        visible = {1996: 10.0, 1997: 7.0, 1998: 7.0, 1999: 5.0}
        self.assertEqual(_rank(10.0, visible), 1)
        self.assertEqual(_rank(7.0, visible), 2)
        self.assertEqual(_rank(5.0, visible), 4)

    def test_missing_value_has_no_rank(self) -> None:
        self.assertIsNone(_rank(None, {1996: 10.0}))


if __name__ == "__main__":
    unittest.main()
