"""Transforme une position lat/lon en position pixel dans l'image GetMap correspondante."""
from __future__ import annotations


def lonlat_to_pixel(lon: float, lat: float, bbox: dict, width: int, height: int, crs: str) -> tuple[int, int]:
    """Retourne (x, y) en pixels pour (lon, lat) dans une image WMS de taille (width, height).

    L'image couvre exactement `bbox` (west, south, east, north). En EPSG:4326 (plate carrée),
    la relation lon/lat -> pixel est linéaire : pas besoin de reprojection. Pour un autre CRS
    supporté par la couche, il faudrait d'abord projeter (lon, lat) avec `pyproj.Transformer`
    dans le système de coordonnées de `bbox` avant d'appliquer la même interpolation linéaire.
    """
    if crs.upper() not in ("EPSG:4326", "CRS:84"):
        raise NotImplementedError(
            f"CRS {crs!r} non géré par ce POC : seul EPSG:4326/CRS:84 est supporté pour l'instant "
            "(la couche découverte par discover_layers.py les expose déjà, donc ce cas ne devrait "
            "pas se produire — voir pyproj.Transformer si un jour une couche impose un autre CRS)."
        )
    x = (lon - bbox["west"]) / (bbox["east"] - bbox["west"]) * width
    y = (bbox["north"] - lat) / (bbox["north"] - bbox["south"]) * height
    return round(x), round(y)
