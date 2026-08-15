"""Interroge GetCapabilities sur le WMS EUMETView et liste les couches FCI/RGB.

Usage:
    python discover_layers.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from eumetview import get_capabilities_xml, iter_layers  # noqa: E402

CONFIG_PATH = Path(__file__).parent / "config.json"
KEYWORDS = re.compile(r"mtg|fci|rgb|natural|colou?r", re.IGNORECASE)


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    wms_base_url = config["wms_base_url"]

    print(f"GetCapabilities sur {wms_base_url} ...")
    capabilities = get_capabilities_xml(wms_base_url)

    matches = [layer for layer in iter_layers(capabilities) if KEYWORDS.search(layer["name"]) or KEYWORDS.search(layer["title"])]

    print(f"\n{len(matches)} couche(s) correspondant à mtg/fci/rgb/natural/colour :\n")
    for layer in matches:
        time_info = f"time={layer['time_dimension']}" if layer["time_dimension"] else "sans dimension temporelle"
        print(f"- {layer['name']!r}  —  {layer['title']}  ({time_info})")
        if layer["crs"]:
            print(f"    CRS: {', '.join(layer['crs'][:6])}{' ...' if len(layer['crs']) > 6 else ''}")

    print("\nChoisir l'identifiant de couche RGB approprié et le reporter dans config.json (clé \"layer\").")


if __name__ == "__main__":
    main()
