import json
from pathlib import Path
from shapely.geometry import Point, Polygon
from geometry import parse_zone
from spatial import get_intersecting_cells
from data import aggregate_cells
from monthly import compute_monthly_climatology
from indicators import compute_annual_indicators
from schema import build_climate_overview_json
from render_svg import render_svg
from render_html import render_html

OUTPUT_DIR = Path(__file__).parent / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

def process_zone(name: str, geojson: dict):
    print(f"\nProcessing zone: {name}")
    geom = parse_zone(geojson)
    
    # 1. Spatial intersection
    cells = get_intersecting_cells(geom)
    print(f"Intersected with {len(cells)} ERA5-Land cells.")
    for c in cells:
        print(f" - Cell ({c['lat']}, {c['lon']}): weight {c['weight']:.4f}")
        
    # 2. Data fetching and aggregation
    daily_df = aggregate_cells(cells)
    
    if daily_df is None or daily_df.empty:
        print("No data available.")
        return
        
    # 3. Monthly and Annual indicators
    monthly_data = compute_monthly_climatology(daily_df)
    annual_data = compute_annual_indicators(daily_df, monthly_data)
    
    # 4. JSON
    # Fake area for POC
    import pyproj
    from shapely.ops import transform
    project = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True).transform
    geom_m2 = transform(project, geom).area
    
    json_str = build_climate_overview_json(geom, cells, monthly_data, annual_data, area_m2=geom_m2)
    with open(OUTPUT_DIR / f"{name}_climate-overview.json", "w", encoding="utf-8") as f:
        f.write(json_str)
        
    # 5. SVG
    svg_str = render_svg(monthly_data, annual_data, title=f"Le climat de {name}")
    with open(OUTPUT_DIR / f"{name}_climate-overview.svg", "w", encoding="utf-8") as f:
        f.write(svg_str)
        
    # 6. HTML
    if len(cells) == 1 and geom.geom_type == 'Point' or geom_m2 < 100_000_000: # approx < 10x10km
        repr_text = "Cette zone est plus petite que la maille climatique utilisée ; les valeurs décrivent donc son contexte climatique régional et non une mesure à la résolution exacte de la zone."
    else:
        repr_text = f"Le portrait climatique agrège {len(cells)} mailles climatiques intersectant la zone, pondérées par leur surface d'intersection."
        
    html_str = render_html(svg_str, annual_data, repr_text)
    with open(OUTPUT_DIR / f"{name}_climate-overview-preview.html", "w", encoding="utf-8") as f:
        f.write(html_str)
        
    print(f"Finished {name}.")

if __name__ == "__main__":
    # Test cases
    
    # Cas unique demandé par l'utilisateur
    point_geojson = {
        "type": "Point",
        "coordinates": [3.682972784135697, 44.06462321251746] # [lon, lat]
    }
    
    process_zone("zone_test_utilisateur", point_geojson)
