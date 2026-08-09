from typing import List, Dict, Any, Tuple
import math
from shapely.geometry import Point, Polygon, box
from shapely.geometry.base import BaseGeometry
import pyproj
from shapely.ops import transform

GRID_DEGREES = 0.1

def get_grid_cell_polygon(lon_center: float, lat_center: float) -> Polygon:
    half = GRID_DEGREES / 2.0
    return box(
        lon_center - half,
        lat_center - half,
        lon_center + half,
        lat_center + half
    )

def project_to_equal_area(geom: BaseGeometry) -> BaseGeometry:
    # Use EPSG:6933 (Cylindrical equal-area) for accurate relative area calculation globally
    project = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True).transform
    return transform(project, geom)

def get_intersecting_cells(geom: BaseGeometry) -> List[Dict[str, Any]]:
    """
    Given a geometry (in EPSG:4326), find all intersecting ERA5-Land grid cells (0.1 deg).
    Returns a list of dicts with:
    - lon: center longitude
    - lat: center latitude
    - weight: spatial weight (sum = 1.0)
    - cell_geom: Shapely Polygon of the cell (EPSG:4326)
    - intersection_area_m2: intersection area in square meters
    """
    
    if geom.geom_type == 'Point':
        lon = round(geom.x / GRID_DEGREES) * GRID_DEGREES
        lat = round(geom.y / GRID_DEGREES) * GRID_DEGREES
        
        # Format explicitly to avoid floating point issues (e.g. 5.1000000000000005)
        lon = round(lon, 3)
        lat = round(lat, 3)
        
        cell_geom = get_grid_cell_polygon(lon, lat)
        return [{
            "lon": lon,
            "lat": lat,
            "weight": 1.0,
            "cell_geom": cell_geom,
            "intersection_area_m2": 0.0 # Point has no area
        }]
        
    # Polygon or MultiPolygon
    bounds = geom.bounds
    min_lon, min_lat, max_lon, max_lat = bounds
    
    # Snap to grid centers
    min_lon_c = round(min_lon / GRID_DEGREES) * GRID_DEGREES
    min_lat_c = round(min_lat / GRID_DEGREES) * GRID_DEGREES
    max_lon_c = round(max_lon / GRID_DEGREES) * GRID_DEGREES
    max_lat_c = round(max_lat / GRID_DEGREES) * GRID_DEGREES
    
    # Iterate over candidate grid cells
    cells = []
    
    lon_c = min_lon_c - GRID_DEGREES
    while lon_c <= max_lon_c + GRID_DEGREES:
        lat_c = min_lat_c - GRID_DEGREES
        while lat_c <= max_lat_c + GRID_DEGREES:
            cell_poly = get_grid_cell_polygon(lon_c, lat_c)
            if cell_poly.intersects(geom):
                intersection = cell_poly.intersection(geom)
                if not intersection.is_empty:
                    cells.append({
                        "lon": round(lon_c, 3),
                        "lat": round(lat_c, 3),
                        "cell_geom": cell_poly,
                        "intersection_geom": intersection
                    })
            lat_c += GRID_DEGREES
        lon_c += GRID_DEGREES
        
    # If no cells intersect (e.g. very small polygon inside a cell), fallback to point behavior using centroid
    if not cells:
        centroid = geom.centroid
        return get_intersecting_cells(Point(centroid.x, centroid.y))
        
    # Calculate weights using equal-area projection
    total_area = 0.0
    for cell in cells:
        proj_intersection = project_to_equal_area(cell["intersection_geom"])
        area_m2 = proj_intersection.area
        cell["intersection_area_m2"] = area_m2
        total_area += area_m2
        
    # Assign weights
    result = []
    if total_area > 0:
        for cell in cells:
            weight = cell["intersection_area_m2"] / total_area
            if weight > 1e-6: # Filter out extremely small overlaps (numerical artifacts)
                result.append({
                    "lon": cell["lon"],
                    "lat": cell["lat"],
                    "weight": weight,
                    "cell_geom": cell["cell_geom"],
                    "intersection_area_m2": cell["intersection_area_m2"]
                })
                
    # Normalize weights again to ensure sum = 1.0 exactly
    weight_sum = sum(c["weight"] for c in result)
    if weight_sum > 0:
        for c in result:
            c["weight"] /= weight_sum
            
    return result
