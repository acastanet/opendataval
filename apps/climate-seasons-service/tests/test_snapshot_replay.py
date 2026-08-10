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
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service import (  # noqa: E402
    ResultContext,
    SnapshotIntegrityError,
    ThermalSeasonsInput,
    assert_thermal_seasons_equivalent,
    build_climate_result,
    build_snapshot_manifest,
    replay_snapshot,
    request_parameters,
    verify_snapshot_asset,
    write_snapshot_manifest,
)


def _temperature() -> pd.Series:
    index = pd.date_range("1991-01-01", "2025-12-31 23:00", freq="h", tz="UTC")
    day = index.dayofyear.to_numpy(dtype=float)
    year = index.year.to_numpy(dtype=float)
    values = (
        10.0
        - 10.0 * np.cos(2.0 * np.pi * (day - 15.0) / 365.0)
        + (year - 1991.0) * 0.03
        + 1.5 * np.sin(2.0 * np.pi * index.hour.to_numpy(dtype=float) / 24.0)
    )
    return pd.Series(values, index=index)


class SnapshotReplayTest(unittest.TestCase):
    def test_snapshot_roundtrip_and_hash_guard(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            raw = Path(temporary) / "raw"
            raw.mkdir()
            temperature = _temperature()
            pd.DataFrame(
                {
                    "valid_time": temperature.index.astype(str),
                    "t2m": temperature.to_numpy() + 273.15,
                }
            ).to_csv(raw / "era5-land.csv", index=False)

            grid, request = request_parameters(44.06465392551458, 3.6829349237761435)
            manifest = build_snapshot_manifest(
                raw,
                snapshot_id="SNAPSHOT-SEASONS-TEST",
                tile_id="GPD-44.064654-3.682935",
                latitude=44.06465392551458,
                longitude=3.6829349237761435,
                created_at="2026-08-10T00:00:00Z",
                retrieved_at="2026-08-10T00:00:00Z",
                grid_latitude=grid.latitude,
                grid_longitude=grid.longitude,
                request_parameters=request,
            )
            schema = json.loads(
                (REPO_ROOT / "packages" / "climate-contracts" / "schemas" / "climate-snapshot.schema.json").read_text(encoding="utf-8")
            )
            Draft202012Validator(schema).validate(manifest)
            manifest_path = write_snapshot_manifest(raw, manifest)

            replayed = replay_snapshot(manifest_path, generated_at="2026-08-10T00:00:01Z")
            direct = build_climate_result(
                ThermalSeasonsInput(temperature),
                context=ResultContext(
                    tile_id="GPD-44.064654-3.682935",
                    latitude=44.06465392551458,
                    longitude=3.6829349237761435,
                    snapshot_id="SNAPSHOT-SEASONS-TEST",
                    grid_latitude=44.1,
                    grid_longitude=3.7,
                    retrieved_at="2026-08-10T00:00:00Z",
                    generated_at="2026-08-10T00:00:01Z",
                ),
            )
            assert_thermal_seasons_equivalent(replayed["data"], direct["data"])

            with (raw / "era5-land.csv").open("a", encoding="utf-8") as handle:
                handle.write("\n")
            with self.assertRaises(SnapshotIntegrityError):
                verify_snapshot_asset(manifest, manifest_path)


if __name__ == "__main__":
    unittest.main()
