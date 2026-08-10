from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-seasons-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_seasons_service import write_thermal_seasons_result_svg  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rend « Les saisons se déplacent » depuis un ClimateResult thermal-seasons@1.0.0."
    )
    parser.add_argument("input", type=Path, help="ClimateResult JSON")
    parser.add_argument(
        "--output",
        type=Path,
        help="SVG de sortie ; défaut : thermal-seasons-v1-neutral.svg à côté du JSON",
    )
    args = parser.parse_args()

    result = json.loads(args.input.read_text(encoding="utf-8"))
    output = args.output or args.input.with_name("thermal-seasons-v1-neutral.svg")
    write_thermal_seasons_result_svg(result, output)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
