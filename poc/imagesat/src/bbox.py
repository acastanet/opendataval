"""Calcule une bbox géographique approximative autour d'un point GPS."""
from __future__ import annotations

import math

KM_PER_DEGREE_LAT = 110.574
KM_PER_DEGREE_LON_AT_EQUATOR = 111.320


def bbox_from_point(lat: float, lon: float, radius_km: float) -> dict:
    """Retourne une bbox {west, south, east, north} en degrés autour de (lat, lon)."""
    lat_delta = radius_km / KM_PER_DEGREE_LAT
    cosine = max(math.cos(math.radians(lat)), 0.01)
    lon_delta = min(180.0, radius_km / (KM_PER_DEGREE_LON_AT_EQUATOR * cosine))
    return {
        "west": lon - lon_delta,
        "south": lat - lat_delta,
        "east": lon + lon_delta,
        "north": lat + lat_delta,
    }
