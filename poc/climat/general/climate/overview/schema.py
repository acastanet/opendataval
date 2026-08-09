import json
from typing import Dict, Any, List
from shapely.geometry.base import BaseGeometry

def build_climate_overview_json(
    geom: BaseGeometry,
    intersecting_cells: List[Dict[str, Any]],
    monthly_data: List[Dict[str, Any]],
    annual_data: Dict[str, Any],
    area_m2: float = None,
) -> str:
    """
    Builds the final JSON string according to the specification.
    """
    centroid = geom.centroid
    
    # Format representativity
    cells = []
    for c in intersecting_cells:
        cells.append({
            "lat": c["lat"],
            "lon": c["lon"],
            "weight": round(c["weight"], 4)
        })
        
    doc = {
        "schema_version": "1.0",
        "zone": {
            "geometry_type": geom.geom_type,
            "area_m2": area_m2,
            "centroid": {
                "lat": round(centroid.y, 4),
                "lon": round(centroid.x, 4)
            }
        },
        "reference": {
            "start": 1991,
            "end": 2020
        },
        "representativity": {
            "datasets": ["reanalysis-era5-land-timeseries"],
            "grid_cell_count": len(cells),
            "spatial_weighting": "area_weighted",
            "cells": cells
        },
        "monthly": monthly_data,
        "annual": annual_data,
        "quality": {
            "note": "Data fetched dynamically for POC."
        },
        "provenance": {
            "source": "Copernicus Climate Data Store",
            "retrieval_method": "cdsapi locally cached for POC"
        }
    }
    
    return json.dumps(doc, indent=2, ensure_ascii=False)
