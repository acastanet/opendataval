"""Client minimal pour le service WMS public EUMETView (GeoServer)."""
from __future__ import annotations

import xml.etree.ElementTree as ET

import requests

WMS_NS = "{http://www.opengis.net/wms}"
TIMEOUT_S = 30


def get_capabilities_xml(wms_base_url: str) -> ET.Element:
    """Interroge GetCapabilities et retourne la racine du XML WMS_Capabilities."""
    response = requests.get(
        wms_base_url,
        params={"service": "WMS", "version": "1.3.0", "request": "GetCapabilities"},
        timeout=TIMEOUT_S,
    )
    response.raise_for_status()
    return ET.fromstring(response.content)


def iter_layers(capabilities: ET.Element):
    """Itère sur les éléments <Layer> feuilles (ceux qui ont un <Name>)."""
    for layer in capabilities.iter(f"{WMS_NS}Layer"):
        name = layer.find(f"{WMS_NS}Name")
        if name is None or not name.text:
            continue
        title = layer.find(f"{WMS_NS}Title")
        time_dim = layer.find(f"{WMS_NS}Dimension[@name='time']")
        crs_list = [el.text for el in layer.findall(f"{WMS_NS}CRS")] + [el.text for el in layer.findall(f"{WMS_NS}SRS")]
        yield {
            "name": name.text,
            "title": title.text if title is not None else "",
            "time_dimension": time_dim.text.strip() if time_dim is not None and time_dim.text else None,
            "crs": [c for c in crs_list if c],
        }


def get_map(wms_base_url: str, layer: str, bbox: dict, crs: str, width: int, height: int, time: str | None = None) -> bytes:
    """Effectue une requête GetMap et retourne les octets PNG de l'image."""
    if crs.upper() == "EPSG:4326":
        # WMS 1.3.0 + EPSG:4326 impose l'ordre (lat,lon) = (south,west,north,east).
        bbox_str = f"{bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']}"
    else:
        bbox_str = f"{bbox['west']},{bbox['south']},{bbox['east']},{bbox['north']}"
    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetMap",
        "layers": layer,
        "styles": "",
        "crs": crs,
        "bbox": bbox_str,
        "width": str(width),
        "height": str(height),
        "format": "image/png",
    }
    if time:
        params["time"] = time
    response = requests.get(wms_base_url, params=params, timeout=TIMEOUT_S)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if "image" not in content_type:
        raise RuntimeError(f"Réponse GetMap inattendue (content-type={content_type}): {response.text[:300]}")
    return response.content
