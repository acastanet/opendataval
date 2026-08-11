"""Adaptateur du POC saisons vers le collecteur climatique partagé."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIMATE_V2_ROOT = ROOT.parent
if str(CLIMATE_V2_ROOT) not in sys.path:
    sys.path.insert(0, str(CLIMATE_V2_ROOT))

from climate_shared.collect import download_climate_assets


def main() -> None:
    parser = argparse.ArgumentParser(description="Collecte les données V4 depuis un GPS via le système partagé.")
    parser.add_argument("--lat", required=True, type=float, help="latitude WGS84")
    parser.add_argument("--lon", required=True, type=float, help="longitude WGS84")
    parser.add_argument("--credentials", type=Path, help="chemin optionnel vers .cdsapirc")
    parser.add_argument("--force", action="store_true", help="force un nouveau téléchargement pour ce point")
    args = parser.parse_args()
    download_climate_assets(
        args.lat,
        args.lon,
        ROOT / "input",
        credentials_path=args.credentials,
        force=args.force,
    )


if __name__ == "__main__":
    main()
