"""Contrat JSON versionné de l'infographie hydrologique."""

from __future__ import annotations

SCHEMA_VERSION = "1.0"
MONTH_KEYS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
PERIODS = {
    "reference": [1991, 2020],
    "study": [1996, 2025],
    "early": [1996, 2005],
    "middle": [2006, 2015],
    "late": [2016, 2025],
}

METRIC_FIELDS = (
    "precipitation_mm",
    "soil_water_0_100_mm",
    "actual_evapotranspiration_mm",
    "spei3",
)


def empty_month() -> dict:
    """Toutes les clés de données publiques, sans jamais fabriquer de valeur."""
    result = {}
    for metric in METRIC_FIELDS:
        result.update({f"{metric}_p25": None, f"{metric}_median": None, f"{metric}_p75": None})
    result.update({
        "soil_water_reference_percentile_p25": None,
        "soil_water_reference_percentile_median": None,
        "soil_water_reference_percentile_p75": None,
        "soil_water_layer_1_m3m3_median": None,
        "runoff_mm_median": None,
        "surface_runoff_mm_median": None,
        "sub_surface_runoff_mm_median": None,
        "snowfall_mm_we_median": None,
        "snowmelt_mm_we_median": None,
        "snow_depth_water_equivalent_mm_median": None,
        "valid_years": 0,
        "status": "missing",
    })
    return result


def empty_document(tile_id: str | None, lat: float | None, lon: float | None) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "tile": {"tile_id": tile_id, "lat": lat, "lon": lon},
        "representativity": {
            "grid_lat": None, "grid_lon": None, "grid_resolution_deg": 0.1,
            "native_resolution_km": 9, "site_altitude_m": None,
            "model_orography_m": None, "altitude_difference_m": None,
        },
        "periods": PERIODS,
        "sources": {
            "precipitation": "ERA5-Land", "soil_water": "ERA5-Land",
            "actual_evapotranspiration": "ERA5-Land", "spei3": "ERA5-Drought",
            "dataset_version": None, "retrieved_at": None,
        },
        "method": {
            "precipitation": "somme mensuelle, m vers mm",
            "soil_water_0_100": "1000 × (0.07 × θ1 + 0.21 × θ2 + 0.72 × θ3), moyenne mensuelle",
            "actual_evapotranspiration": "somme mensuelle de -total_evaporation, m vers mm",
            "decadal_statistics": "percentiles linéaires P25, médiane, P75",
            "reference": "distribution mensuelle 1991-2020",
        },
        "monthly": {label: {month: empty_month() for month in MONTH_KEYS} for label in
                    ("1996-2005", "2006-2015", "2016-2025")},
        "reference_monthly": {month: empty_month() for month in MONTH_KEYS},
        "comparison": {
            "annual_precip_change_pct": None,
            "summer_soil_water_change_mm": None,
            "dry_months_change": None,
            "dry_months_definition": "nombre moyen de mois par an avec SPEI-3 < -1,0 ; tardif moins précoce",
        },
        "quality": {"variables": {}, "monthly_completeness": {}, "generated_at": None},
    }
