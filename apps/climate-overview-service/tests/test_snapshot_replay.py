from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_overview_service import (  # noqa: E402
    SnapshotIntegrityError,
    assert_overview_equivalent,
    build_snapshot_manifest,
    replay_snapshot,
    request_parameters,
    verify_snapshot_assets,
    write_snapshot_manifest,
)


def write_assets(raw: Path) -> None:
    index = pd.date_range("1991-01-01", "2020-12-31", freq="D", tz="UTC")
    day = index.dayofyear.to_numpy(dtype=float)
    temp_c = 10.0 - 8.0 * np.cos(2 * np.pi * (day - 15) / 365.25)
    pd.DataFrame({"valid_time": index, "t2m": temp_c + 273.15}).to_csv(raw / "era5-land.csv", index=False)
    pd.DataFrame({"valid_time": index, "tp": np.full(len(index), 0.001)}).to_csv(raw / "era5-land-precipitation.csv", index=False)


class SnapshotReplayTest(unittest.TestCase):
    def _manifest(self, raw: Path) -> dict:
        grid, request = request_parameters(44.06462321251746, 3.682972784135697)
        return build_snapshot_manifest(
            raw,
            snapshot_id="SNAPSHOT-OVERVIEW-TEST",
            tile_id="GPD-44.064623-3.682973",
            latitude=44.06462321251746,
            longitude=3.682972784135697,
            created_at="2026-08-10T00:00:00Z",
            retrieved_at="2026-08-10T00:00:00Z",
            grid_latitude=grid.latitude,
            grid_longitude=grid.longitude,
            request_parameters=request,
            dataset_version="test",
        )

    def test_snapshot_schema_hash_and_replay(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            raw = Path(temporary)
            write_assets(raw)
            manifest = self._manifest(raw)
            schema = json.loads((REPO_ROOT / "packages" / "climate-contracts" / "schemas" / "climate-snapshot.schema.json").read_text(encoding="utf-8"))
            Draft202012Validator(schema).validate(manifest)
            manifest_path = write_snapshot_manifest(raw, manifest)
            verify_snapshot_assets(manifest, manifest_path)
            first = replay_snapshot(manifest_path, generated_at="2026-08-10T00:00:01Z")
            second = replay_snapshot(manifest_path, generated_at="2026-08-10T00:00:02Z")
            assert_overview_equivalent(first["data"], second["data"])
            self.assertEqual(len(first["signals"]), 7)

    def test_modified_asset_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            raw = Path(temporary)
            write_assets(raw)
            manifest = self._manifest(raw)
            manifest_path = write_snapshot_manifest(raw, manifest)
            with (raw / "era5-land-precipitation.csv").open("a", encoding="utf-8") as handle:
                handle.write("tampered\n")
            with self.assertRaises(SnapshotIntegrityError):
                verify_snapshot_assets(manifest, manifest_path)


if __name__ == "__main__":
    unittest.main()
