from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-overview-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_overview_service import write_overview_result_svg  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Rend un ClimateResult climate-overview en SVG V1 neutral")
    parser.add_argument("input", type=Path, help="ClimateResult JSON")
    parser.add_argument("output", nargs="?", type=Path, help="SVG cible ; défaut : climate-overview-v1-neutral.svg à côté du JSON")
    args = parser.parse_args()

    source = args.input.resolve()
    result = json.loads(source.read_text(encoding="utf-8"))
    output = args.output.resolve() if args.output else source.with_name("climate-overview-v1-neutral.svg")
    write_overview_result_svg(result, output)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
