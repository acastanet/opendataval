"""POC 2 — GPS -> image géoréférencée avec position exacte du lieu.

Usage:
    python poc2.py 44.0646 3.6830 [--radius 50]
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
from georef import lonlat_to_pixel  # noqa: E402
from latest import latest_time_for_layer  # noqa: E402
from render_location import draw_marker  # noqa: E402

ROOT = Path(__file__).parent
CONFIG_PATH = ROOT / "config.json"
OUTPUT_DIR = ROOT / "output" / "poc2"
IMAGE_WIDTH = 1024
IMAGE_HEIGHT = 1024

VIEWER_TEMPLATE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>POC2 — {lat}, {lon}</title>
<style>
  body {{ font-family: sans-serif; max-width: 900px; margin: 2rem auto; }}
  dl {{ display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }}
  img {{ max-width: 100%; border: 1px solid #ccc; }}
</style>
</head>
<body>
  <h1>POC2 — position GPS sur image satellite</h1>
  <dl>
    <dt>Coordonnées</dt><dd>{lat}, {lon}</dd>
    <dt>Observation satellite</dt><dd>{observation_time}</dd>
    <dt>Âge</dt><dd>{latency_minutes} minutes</dd>
    <dt>Position pixel</dt><dd>x={pixel_x}, y={pixel_y}</dd>
  </dl>
  <img src="located.png" alt="Image satellite avec position GPS">
</body>
</html>
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="GPS -> image géoréférencée avec position exacte")
    parser.add_argument("lat", type=float)
    parser.add_argument("lon", type=float)
    parser.add_argument("--radius", type=float, default=50.0, help="Rayon en km (défaut 50)")
    parser.add_argument("--bbox-offset-km", type=float, default=0.0, help="Décale la bbox vers l'est pour tester le géoréférencement (voir plan.md)")
    return parser.parse_args()


def run(lat: float, lon: float, radius_km: float, bbox_offset_km: float = 0.0) -> dict:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    wms_base_url = config["wms_base_url"]
    layer = config["layer"]
    crs = config["crs"]

    bbox = bbox_from_point(lat, lon, radius_km)
    if bbox_offset_km:
        offset_deg = bbox_offset_km / 111.320
        bbox = {"west": bbox["west"] + offset_deg, "east": bbox["east"] + offset_deg, "south": bbox["south"], "north": bbox["north"]}

    capabilities = get_capabilities_xml(wms_base_url)
    observation_time = latest_time_for_layer(capabilities, layer)

    raw_bytes = get_map(wms_base_url, layer, bbox, crs, IMAGE_WIDTH, IMAGE_HEIGHT, time=observation_time)
    retrieved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    observation_dt = datetime.fromisoformat(observation_time.replace("Z", "+00:00"))
    retrieved_dt = datetime.fromisoformat(retrieved_at.replace("Z", "+00:00"))
    latency_minutes = round((retrieved_dt - observation_dt).total_seconds() / 60, 1)

    pixel_x, pixel_y = lonlat_to_pixel(lon, lat, bbox, IMAGE_WIDTH, IMAGE_HEIGHT, crs)
    located_bytes = draw_marker(raw_bytes, pixel_x, pixel_y)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "raw.png").write_bytes(raw_bytes)
    (OUTPUT_DIR / "located.png").write_bytes(located_bytes)

    metadata = {
        "requested_location": {"lat": lat, "lon": lon},
        "image_position": {"x": pixel_x, "y": pixel_y},
        "crs": crs,
        "bbox": bbox,
        "observation_time": observation_time,
        "retrieved_at": retrieved_at,
        "latency_minutes": latency_minutes,
        "layer": layer,
        "radius_km": radius_km,
    }
    (OUTPUT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")

    viewer_html = VIEWER_TEMPLATE.format(
        lat=lat, lon=lon,
        observation_time=observation_time,
        latency_minutes=latency_minutes,
        pixel_x=pixel_x, pixel_y=pixel_y,
    )
    (OUTPUT_DIR / "viewer.html").write_text(viewer_html, encoding="utf-8")

    return metadata


def main() -> None:
    args = parse_args()
    metadata = run(args.lat, args.lon, args.radius, args.bbox_offset_km)
    print(json.dumps(metadata, indent=2, ensure_ascii=False))
    print(f"\nSorties écrites dans {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
