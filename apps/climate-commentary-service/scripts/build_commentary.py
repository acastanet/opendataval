from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-commentary-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_commentary_service import build_commentary  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Construit et valide ClimateCommentary depuis un payload JSON produit par un LLM."
    )
    parser.add_argument("results", nargs="+", type=Path, help="ClimateResult JSON utilisés comme preuve")
    parser.add_argument("--model-payload", required=True, type=Path, help="JSON avec summary/findings/caveats/abstentions")
    parser.add_argument("--model", required=True, help="Identifiant du modèle utilisé")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--generated-at")
    parser.add_argument("--commentary-id")
    args = parser.parse_args()

    results = [json.loads(path.read_text(encoding="utf-8")) for path in args.results]
    model_payload = json.loads(args.model_payload.read_text(encoding="utf-8"))
    commentary = build_commentary(
        results,
        model_payload,
        model=args.model,
        generated_at=args.generated_at,
        commentary_id=args.commentary_id,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(commentary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
