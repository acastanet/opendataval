from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-commentary-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_commentary_service import generate_commentary  # noqa: E402
from climate_commentary_service.ilaas import (  # noqa: E402
    IlaasConfig,
    IlaasError,
    create_ilaas_generator,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Génère et valide un ClimateCommentary avec le même ILAAS que geologie-service."
    )
    parser.add_argument("results", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser


def main() -> int:
    args = _parser().parse_args()
    results = [json.loads(path.read_text(encoding="utf-8")) for path in args.results]
    config = IlaasConfig.from_env()

    try:
        commentary = generate_commentary(
            results,
            create_ilaas_generator(config),
            model=f"ilaas/{config.model}",
        )
    except IlaasError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(commentary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
