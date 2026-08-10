from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "apps" / "climate-water-service" / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

from climate_water_service import WaterContext, WaterThroughYearInput, build_signals, compute_water_through_year_data  # noqa: E402


class SpeiSemanticsP9Test(unittest.TestCase):
    def test_lower_monthly_medians_can_coexist_with_fewer_dry_threshold_crossings(self) -> None:
        index = pd.date_range("1991-01-01", "2025-12-01", freq="MS", tz="UTC")
        land = pd.DataFrame(
            {
                "total_precipitation": 0.001,
                "volumetric_soil_water_layer_1": 0.30,
                "volumetric_soil_water_layer_2": 0.32,
                "volumetric_soil_water_layer_3": 0.34,
                "total_evaporation": -0.001,
            },
            index=index,
        )
        spei = pd.Series(0.0, index=index, name="spei3")

        # Période ancienne : deux franchissements < -1 par an (janvier et juillet).
        early = (spei.index.year >= 1996) & (spei.index.year <= 2005)
        spei.loc[early & spei.index.month.isin([1, 7])] = -1.5

        # Période récente : un seul franchissement < -1 par an (janvier), mais
        # un niveau de -0,3 sur les autres mois. Dix médianes mensuelles sur douze
        # sont donc plus basses, sans créer de mois supplémentaire sous le seuil -1.
        late = (spei.index.year >= 2016) & (spei.index.year <= 2025)
        spei.loc[late] = -0.3
        spei.loc[late & (spei.index.month == 1)] = -1.5

        result = compute_water_through_year_data(
            WaterThroughYearInput(land, spei),
            context=WaterContext(
                tile_id="P9-SPEI",
                latitude=44.0,
                longitude=3.0,
            ),
        )

        self.assertEqual(result["comparison"]["dry_months_change"], -1.0)
        signal = next(item for item in build_signals(result) if item["metric"] == "dry_months_change")
        self.assertEqual(signal["direction"], "less_frequent")

        early_monthly = result["monthly"]["1996-2005"]
        late_monthly = result["monthly"]["2016-2025"]
        lower_medians = sum(
            late_monthly[month]["spei3_median"] < early_monthly[month]["spei3_median"]
            for month in ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
        )
        self.assertGreaterEqual(lower_medians, 10)


if __name__ == "__main__":
    unittest.main()
