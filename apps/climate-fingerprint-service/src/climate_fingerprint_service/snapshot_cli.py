from __future__ import annotations

import argparse
import json
from pathlib import Path

from .legacy_metadata import legacy_poc_acquisition_metadata
from .snapshot import build_snapshot_manifest, replay_snapshot, write_snapshot_manifest


def _metadata_template(args: argparse.Namespace) -> int:
    metadata = legacy_poc_acquisition_metadata(
        args.latitude,
        args.longitude,
        retrieved_at=args.retrieved_at,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.output)
    return 0


def _build(args: argparse.Namespace) -> int:
    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    if not isinstance(metadata, dict):
        raise SystemExit("Le fichier --metadata doit contenir un objet JSON indexé par asset_id")
    manifest = build_snapshot_manifest(
        args.raw_directory,
        snapshot_id=args.snapshot_id,
        tile_id=args.tile_id,
        latitude=args.latitude,
        longitude=args.longitude,
        created_at=args.created_at,
        acquisition_metadata=metadata,
    )
    output = write_snapshot_manifest(
        args.raw_directory,
        manifest,
        filename=args.output_name,
    )
    print(output)
    return 0


def _replay(args: argparse.Namespace) -> int:
    result = replay_snapshot(args.manifest, generated_at=args.generated_at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.output)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build or replay a climate fingerprint ClimateSnapshot")
    subparsers = parser.add_subparsers(dest="command", required=True)

    metadata_parser = subparsers.add_parser(
        "metadata-template",
        help="Reproduire les paramètres d'acquisition du POC historique sans télécharger de données",
    )
    metadata_parser.add_argument("--latitude", type=float, required=True)
    metadata_parser.add_argument("--longitude", type=float, required=True)
    metadata_parser.add_argument("--retrieved-at", required=True)
    metadata_parser.add_argument("--output", type=Path, required=True)
    metadata_parser.set_defaults(func=_metadata_template)

    build_parser = subparsers.add_parser("build", help="Construire un ClimateSnapshot depuis six actifs déjà acquis")
    build_parser.add_argument("raw_directory", type=Path)
    build_parser.add_argument("--metadata", type=Path, required=True)
    build_parser.add_argument("--snapshot-id", required=True)
    build_parser.add_argument("--tile-id", required=True)
    build_parser.add_argument("--latitude", type=float, required=True)
    build_parser.add_argument("--longitude", type=float, required=True)
    build_parser.add_argument("--created-at", required=True)
    build_parser.add_argument("--output-name", default="climate-snapshot.json")
    build_parser.set_defaults(func=_build)

    replay_parser = subparsers.add_parser("replay", help="Rejouer un ClimateSnapshot vérifié")
    replay_parser.add_argument("manifest", type=Path)
    replay_parser.add_argument("output", type=Path)
    replay_parser.add_argument("--generated-at")
    replay_parser.set_defaults(func=_replay)

    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
