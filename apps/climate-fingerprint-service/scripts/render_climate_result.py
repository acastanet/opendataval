from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-fingerprint-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_fingerprint_service import write_fingerprint_result_svg  # noqa: E402


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Rend l'empreinte climatique V4 depuis un ClimateResult P6 natif."
    )
    parser.add_argument("input", type=Path, help="ClimateResult JSON")
    parser.add_argument(
        "--output",
        type=Path,
        help="SVG de sortie (défaut: climate-fingerprint-v4.svg à côté du JSON)",
    )
    parser.add_argument("--theme", choices=("light", "neutral"), default="light")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    result = json.loads(args.input.read_text(encoding="utf-8"))
    output = args.output or args.input.with_name("climate-fingerprint-v4.svg")
    write_fingerprint_result_svg(result, output, theme=args.theme)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
