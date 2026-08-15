"""Détermine le dernier timestamp disponible pour une couche WMS, via GetCapabilities."""
from __future__ import annotations

import xml.etree.ElementTree as ET

from eumetview import iter_layers


def latest_time_for_layer(capabilities: ET.Element, layer_name: str) -> str:
    """Retourne le timestamp ISO le plus récent annoncé par la dimension `time` de la couche.

    La dimension WMS est de la forme "start/end/period" (ex: "...Z/2026-08-14T06:50:00.000Z/PT10M") :
    `end` est la dernière observation que le serveur annonce comme disponible.
    """
    for layer in iter_layers(capabilities):
        if layer["name"] != layer_name:
            continue
        if not layer["time_dimension"]:
            raise ValueError(f"La couche {layer_name!r} n'expose pas de dimension temporelle")
        parts = layer["time_dimension"].split("/")
        if len(parts) < 2:
            raise ValueError(f"Dimension temporelle inattendue pour {layer_name!r}: {layer['time_dimension']!r}")
        return parts[1]
    raise ValueError(f"Couche introuvable dans GetCapabilities : {layer_name!r}")
