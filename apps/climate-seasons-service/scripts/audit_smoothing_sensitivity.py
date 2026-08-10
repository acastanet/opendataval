from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service.science import (  # noqa: E402
    build_climatology,
    compute_thresholds,
    prepare_daily_series_with_diagnostics,
)
from climate_seasons_service.sensitivity import crossing_sensitivity, max_crossing_spread_days  # noqa: E402
from climate_seasons_service.snapshot import load_snapshot, read_temperature, verify_snapshot_asset  # noqa: E402


def crossing_dict(value):
    if value is None:
        return None
    return {
        "spring_start": value.spring_start,
        "summer_start": value.summer_start,
        "autumn_start": value.autumn_start,
        "winter_start": value.winter_start,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit P9 de sensibilité du lissage thermal-seasons V1")
    parser.add_argument("snapshot", type=Path, help="climate-snapshot.json du replay réel")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    snapshot = load_snapshot(args.snapshot)
    asset = verify_snapshot_asset(snapshot, args.snapshot)
    temperature = read_temperature(asset)
    daily_by_year, _ = prepare_daily_series_with_diagnostics(temperature, range(1991, 2026))
    climatology = build_climatology(daily_by_year)
    t25, t75 = compute_thresholds(climatology)

    years = {}
    max_spread = 0.0
    invalid_years = []
    for year in range(1996, 2026):
        values = daily_by_year.get(year)
        if values is None or bool(np.all(np.isnan(values))):
            invalid_years.append(year)
            continue
        crossings = crossing_sensitivity(values, t25, t75)
        spread = max_crossing_spread_days(crossings)
        if spread is None:
            invalid_years.append(year)
        else:
            max_spread = max(max_spread, float(spread))
        years[str(year)] = {
            "max_crossing_spread_days": spread,
            "methods": {name: crossing_dict(value) for name, value in crossings.items()},
        }

    payload = {
        "audit": "thermal-seasons-smoothing-sensitivity-p9",
        "snapshot_id": snapshot.get("snapshot_id"),
        "thresholds": {"t25_c": t25, "t75_c": t75},
        "maximum_annual_crossing_spread_days": max_spread,
        "interpretation": (
            "robust_le_3_days" if max_spread <= 3.0 else
            "review_3_to_10_days" if max_spread <= 10.0 else
            "major_method_sensitivity_gt_10_days"
        ),
        "invalid_years": invalid_years,
        "years": years,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
