import json
from typing import Dict, Any, Tuple
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from shapely.geometry.base import BaseGeometry

def parse_zone(geojson: Dict[str, Any]) -> BaseGeometry:
    """
    Parse a GeoJSON dictionary and return a Shapely geometry.
    Handles Feature, Geometry directly.
    """
    if "type" in geojson and geojson["type"] == "Feature":
        geom = shape(geojson["geometry"])
    else:
        geom = shape(geojson)
        
    if not isinstance(geom, (Point, Polygon, MultiPolygon)):
        raise ValueError(f"Unsupported geometry type: {geom.geom_type}")
        
    return geom

def get_bbox(geom: BaseGeometry) -> Tuple[float, float, float, float]:
    """
    Returns (minx, miny, maxx, maxy)
    """
    return geom.bounds

def get_centroid(geom: BaseGeometry) -> Tuple[float, float]:
    """
    Returns (lon, lat) of the centroid.
    """
    centroid = geom.centroid
    return (centroid.x, centroid.y)
