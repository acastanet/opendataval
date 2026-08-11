"""Chaîne autonome : snapshot ERA5-Land -> ClimateResult V4 -> données du navigateur."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from climate_seasons_service.compute import ThermalSeasonsInput
from climate_seasons_service.result import ResultContext
from climate_seasons_service.snapshot import load_snapshot, read_temperature, verify_snapshot_asset
from climate_seasons_service.v4 import build_climate_result_v4


def result_context(snapshot: dict[str, Any], generated_at: str | None) -> ResultContext:
    requested = snapshot["requested_location"]
    longitude, latitude = requested["geometry"]["coordinates"]
    asset = snapshot["assets"][0]
    represented = asset["represented_spatial"]
    return ResultContext(
        tile_id=str(requested["tile_id"]),
        latitude=float(latitude),
        longitude=float(longitude),
        snapshot_id=str(snapshot["snapshot_id"]),
        grid_latitude=float(represented["lat"]),
        grid_longitude=float(represented["lon"]),
        retrieved_at=str(asset["retrieval"]["retrieved_at"]),
        generated_at=generated_at,
    )


def browser_data(result: dict[str, Any]) -> dict[str, Any]:
    data = result["data"]
    bootstrap_metrics = data["qa"]["bootstrap"]["differences_late_minus_early"]["metrics"]
    labels = (
        ("spring_start_shift_days", "Début du printemps", "negative"),
        ("summer_start_shift_days", "Début de l’été", "negative"),
        ("autumn_start_shift_days", "Début de l’automne", "positive"),
        ("winter_start_shift_days", "Début de l’hiver", "positive"),
        ("summer_length_change_days", "Durée de l’été", "positive"),
    )
    return {
        "location": (
            f"GPS {result['location']['requested']['geometry']['coordinates'][1]:.4f}° N · "
            f"{result['location']['requested']['geometry']['coordinates'][0]:.4f}° E\n"
            f"Grille ERA5-Land : {data['source']['grid_lat']:.1f}° N · {data['source']['grid_lon']:.1f}° E"
        ).replace(".", ","),
        "reference": data["thresholds"]["reference_period"].replace("-", "–"),
        "source": "Copernicus · ERA5-Land",
        "thresholds": {"t25": data["thresholds"]["t25_c"], "t75": data["thresholds"]["t75_c"]},
        "bootstrapReplicates": data["method"]["bootstrap_replicates"],
        "decades": {
            period: data["decades"][period]["canonical_boundaries"]
            for period in ("1996-2005", "2016-2025")
        },
        "metrics": [
            {
                "label": label,
                "value": data["comparison"][key],
                "direction": direction,
                "robustness": bootstrap_metrics[key]["proportion_negative" if direction == "negative" else "proportion_positive"],
            }
            for key, label, direction in labels
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Rejoue le calcul V4 et prépare l’infographie autonome.")
    parser.add_argument("--generated-at", help="Horodatage ISO optionnel pour un résultat déterministe.")
    parser.add_argument("--input-dir", type=Path, default=ROOT / "input", help="répertoire partagé contenant le snapshot et les actifs bruts")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output", help="répertoire du ClimateResult V4")
    parser.add_argument("--web-data", type=Path, default=ROOT / "data.js", help="fichier JavaScript consommé par index.html")
    args = parser.parse_args()

    manifest_path = args.input_dir / "climate-snapshot.json"
    snapshot = load_snapshot(manifest_path)
    temperature_path = verify_snapshot_asset(snapshot, manifest_path)
    result = build_climate_result_v4(
        ThermalSeasonsInput(temperature_c=read_temperature(temperature_path)),
        context=result_context(snapshot, args.generated_at),
    )

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    result_path = output_dir / "thermal-seasons-v4-replay.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    browser_path = args.web_data
    browser_path.parent.mkdir(parents=True, exist_ok=True)
    browser_path.write_text(
        "/* Généré par scripts/rebuild.py depuis output/thermal-seasons-v4-replay.json. */\n"
        f"window.SEASONS_DATA = {json.dumps(browser_data(result), ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )
    print(f"Résultat V4 : {result_path}")
    print(f"Données navigateur : {browser_path}")


if __name__ == "__main__":
    main()
