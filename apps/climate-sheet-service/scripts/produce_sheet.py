from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BUILD_SCRIPT = REPO_ROOT / "apps" / "climate-sheet-service" / "scripts" / "build_static_sheet.py"
COMMENTARY_SCRIPT = REPO_ROOT / "apps" / "climate-commentary-service" / "scripts" / "generate_ilaas_commentary.py"
DEFAULT_OUTPUT = REPO_ROOT / "apps" / "web" / "public" / "climat" / "generated"

DEFAULTS = {
    "overview": REPO_ROOT / "poc" / "climat" / "general" / "climate" / "overview" / "outputs" / "zone_test_utilisateur_climate-overview.json",
    "fingerprint": REPO_ROOT / "poc" / "climat" / "empreinte-climatique" / "example" / "climate-fingerprint-v4.json",
    "seasons": REPO_ROOT / "doc" / "climat" / "validations" / "data" / "thermal-seasons-v4" / "thermal-seasons-v4-replay.json",
    "water": REPO_ROOT / "poc" / "climat" / "bilan eau" / "output" / "water-through-year.json",
}
EXPECTED_METHODS = {
    "overview": ("climate-overview", "1.0.0"),
    "fingerprint": ("climate-fingerprint", "4.0.0"),
    "seasons": ("thermal-seasons", "4.0.0"),
    "water": ("water-through-year", "1.0.0"),
}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Produit la fiche /climat/ à partir de quatre ClimateResult. "
            "En mode auto, ILAAS est appelé uniquement si les quatre entrées contiennent des ClimateSignal "
            "et si GEOLOGIE_LLM_API_KEY est définie."
        )
    )
    for key, default in DEFAULTS.items():
        parser.add_argument(f"--{key}", type=Path, default=default)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--commentary-mode",
        choices=("auto", "required", "off"),
        default="auto",
        help="auto: commentaire si possible; required: échec si ILAAS n'est pas exécutable; off: aucun commentaire.",
    )
    return parser


def _load(path: Path) -> dict:
    if not path.is_file():
        raise SystemExit(f"Entrée climat absente : {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"Entrée climat invalide : {path}")
    return value


def _full_climate_result(path: Path, key: str) -> bool:
    value = _load(path)
    method = value.get("method") or {}
    expected_id, expected_version = EXPECTED_METHODS[key]
    return (
        value.get("result_id")
        and method.get("id") == expected_id
        and method.get("version") == expected_version
        and isinstance(value.get("signals"), list)
        and len(value["signals"]) > 0
    )


def _run(arguments: list[str]) -> None:
    subprocess.run(arguments, cwd=REPO_ROOT, check=True)


def main() -> int:
    args = _parser().parse_args()
    paths = {
        key: Path(getattr(args, key)).resolve()
        for key in ("overview", "fingerprint", "seasons", "water")
    }
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)

    full_results = {key: _full_climate_result(path, key) for key, path in paths.items()}
    can_comment = all(full_results.values())
    has_key = bool(os.getenv("GEOLOGIE_LLM_API_KEY"))
    commentary_path: Path | None = None

    if args.commentary_mode == "required":
        if not can_comment:
            missing = ", ".join(key for key, ok in full_results.items() if not ok)
            raise SystemExit(
                "Commentaire ILAAS requis mais certaines entrées ne sont pas des ClimateResult complets avec signaux : "
                + missing
            )
        if not has_key:
            raise SystemExit("Commentaire ILAAS requis mais GEOLOGIE_LLM_API_KEY est absente")

    if args.commentary_mode != "off" and can_comment and has_key:
        commentary_path = output / ".climate-commentary.generated.json"
        _run(
            [
                sys.executable,
                str(COMMENTARY_SCRIPT),
                *(str(paths[key]) for key in ("overview", "fingerprint", "seasons", "water")),
                "--output",
                str(commentary_path),
            ]
        )
    elif args.commentary_mode == "auto":
        reason = "ClimateResult incomplets" if not can_comment else "GEOLOGIE_LLM_API_KEY absente"
        print(f"Commentaire ILAAS non généré ({reason}); publication de la fiche sans commentaire.", file=sys.stderr)

    build_command = [
        sys.executable,
        str(BUILD_SCRIPT),
        "--overview",
        str(paths["overview"]),
        "--fingerprint",
        str(paths["fingerprint"]),
        "--seasons",
        str(paths["seasons"]),
        "--water",
        str(paths["water"]),
        "--output-dir",
        str(output),
    ]
    if commentary_path is not None:
        build_command.extend(("--commentary", str(commentary_path)))
    _run(build_command)

    if commentary_path is not None and commentary_path.exists():
        commentary_path.unlink()

    expected_assets = (
        "climate-overview-v1-neutral.svg",
        "climate-fingerprint-v4-neutral.svg",
        "thermal-seasons-v4.json",
        "water-through-year-v1-neutral.svg",
        "manifest.json",
    )
    missing_assets = [name for name in expected_assets if not (output / name).is_file()]
    if missing_assets:
        raise SystemExit("Production incomplète : " + ", ".join(missing_assets))

    print(f"Fiche climat produite : {output}")
    print(f"Commentaire ILAAS : {'oui' if (output / 'climate-commentary.json').is_file() else 'non'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
