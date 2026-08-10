from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-commentary-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_commentary_service.catalogue import caveat_texts, load_catalogue  # noqa: E402
from climate_commentary_service.prompt import build_messages  # noqa: E402

CATALOGUE = REPO_ROOT / "doc" / "climat" / "signals" / "catalogue.yaml"


def main() -> int:
    parser = argparse.ArgumentParser(description="Prépare le prompt contrôlé du commentaire climat.")
    parser.add_argument("results", nargs="+", type=Path, help="ClimateResult JSON à commenter")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    results = [json.loads(path.read_text(encoding="utf-8")) for path in args.results]
    catalogue = load_catalogue(CATALOGUE)
    payload = {"messages": build_messages(results, caveat_texts=caveat_texts(catalogue))}
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
