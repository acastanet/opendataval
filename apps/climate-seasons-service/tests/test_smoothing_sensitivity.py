from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service.science import compute_thresholds  # noqa: E402
from climate_seasons_service.sensitivity import (  # noqa: E402
    crossing_sensitivity,
    max_crossing_spread_days,
    smooth_circular_moving_average,
    smooth_harmonic,
)


def annual_cycle(offset: float = 0.0) -> np.ndarray:
    day = np.arange(1, 366, dtype=float)
    return 10.0 - 10.0 * np.cos(2.0 * np.pi * (day - 15.0) / 365.0) + offset


class SmoothingSensitivityTest(unittest.TestCase):
    def test_alternative_smoothers_are_circular_and_complete(self) -> None:
        values = annual_cycle()
        harmonic = smooth_harmonic(values, harmonics=2)
        moving = smooth_circular_moving_average(values, window=31)
        self.assertEqual(len(harmonic), 365)
        self.assertEqual(len(moving), 365)
        self.assertTrue(np.isfinite(harmonic).all())
        self.assertTrue(np.isfinite(moving).all())

    def test_clean_cycle_exposes_material_polynomial_sensitivity(self) -> None:
        values = annual_cycle()
        t25, t75 = compute_thresholds(values)
        crossings = crossing_sensitivity(values, t25, t75)
        self.assertTrue(all(item is not None for item in crossings.values()))

        overall_spread = max_crossing_spread_days(crossings)
        self.assertIsNotNone(overall_spread)
        # Le polynôme de degré 3 n'est pas circulaire et s'écarte fortement des
        # deux lissages circulaires, même sur un cycle sinusoïdal sans bruit.
        self.assertGreater(float(overall_spread), 10.0)

        circular_spread = max_crossing_spread_days({
            "harmonic_2": crossings["harmonic_2"],
            "moving_average_31d": crossings["moving_average_31d"],
        })
        self.assertIsNotNone(circular_spread)
        self.assertLess(float(circular_spread), 3.0)

    def test_invalid_even_moving_window_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            smooth_circular_moving_average(annual_cycle(), window=30)


if __name__ == "__main__":
    unittest.main()
