from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from empreinte_climatique.build import write_delivery
from empreinte_climatique.fetch import nearest_grid_point


class PipelineTests(unittest.TestCase):
    def test_selects_the_expected_grids_for_the_reference_point(self) -> None:
        land = nearest_grid_point(44.06465392551458, 3.6829349237761435, 0.1)
        derived = nearest_grid_point(44.06465392551458, 3.6829349237761435, 0.25)

        self.assertEqual((land.latitude, land.longitude), (44.1, 3.7))
        self.assertEqual((derived.latitude, derived.longitude), (44.0, 3.75))

    def test_renders_a_complete_delivery_from_the_reference_json(self) -> None:
        fixture = Path(__file__).parent / "fixtures" / "fingerprint-reference.json"
        fingerprint = json.loads(fixture.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            write_delivery(output, fingerprint)

            self.assertTrue((output / "climate-fingerprint-v4.json").exists())
            self.assertTrue((output / "climate-fingerprint-v4.svg").exists())
            self.assertTrue((output / "exceptional-events-v4.svg").exists())
            html = (output / "index.html").read_text(encoding="utf-8")
            self.assertNotIn("{{LATITUDE}}", html)
            self.assertIn("44,064654", html)


if __name__ == "__main__":
    unittest.main()
