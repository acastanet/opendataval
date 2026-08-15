"""POC 1 — GPS -> image satellite EUMETSAT récente.

Usage:
    python poc1.py 44.0646 3.6830 [--radius 50]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from bbox import bbox_from_point  # noqa: E402
from eumetview import get_capabilities_xml, get_map  # noqa: E402
from latest import latest_time_for_layer  # noqa: E402

ROOT = Path(__file__).parent
CONFIG_PATH = ROOT / "config.json"
OUTPUT_DIR = ROOT / "output" / "poc1"
IMAGE_WIDTH = 1024
IMAGE_HEIGHT = 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="GPS -> image satellite EUMETSAT récente")
    parser.add_argument("lat", type=float)
    parser.add_argument("lon", type=float)
    parser.add_argument("--radius", type=float, default=50.0, help="Rayon en km (défaut 50)")
    return parser.parse_args()


def run(lat: float, lon: float, radius_km: float) -> dict:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    wms_base_url = config["wms_base_url"]
    layer = config["layer"]
    crs = config["crs"]

    bbox = bbox_from_point(lat, lon, radius_km)

    capabilities = get_capabilities_xml(wms_base_url)
    observation_time = latest_time_for_layer(capabilities, layer)

    image_bytes = get_map(wms_base_url, layer, bbox, crs, IMAGE_WIDTH, IMAGE_HEIGHT, time=observation_time)
    retrieved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    observation_dt = datetime.fromisoformat(observation_time.replace("Z", "+00:00"))
    retrieved_dt = datetime.fromisoformat(retrieved_at.replace("Z", "+00:00"))
    latency_minutes = round((retrieved_dt - observation_dt).total_seconds() / 60, 1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "latest.png").write_bytes(image_bytes)

    metadata = {
        "source": "EUMETSAT",
        "satellite": "Meteosat-12",
        "instrument": "FCI",
        "lat": lat,
        "lon": lon,
        "radius_km": radius_km,
        "observation_time": observation_time,
        "retrieved_at": retrieved_at,
        "latency_minutes": latency_minutes,
        "layer": layer,
        "bbox": bbox,
        "image_size_bytes": len(image_bytes),
    }
    (OUTPUT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return metadata


def main() -> None:
    args = parse_args()
    metadata = run(args.lat, args.lon, args.radius)
    print(json.dumps(metadata, indent=2, ensure_ascii=False))
    print(f"\nImage écrite dans {OUTPUT_DIR / 'latest.png'}")


if __name__ == "__main__":
    main()
