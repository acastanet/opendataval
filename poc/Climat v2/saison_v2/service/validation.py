"""Contrôles techniques bloquants du flux ERA5-Land et de son résultat V4."""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from climate_seasons_service.science import (
    MIN_YEAR_COVERAGE,
    NOLEAP_DAYS,
    prepare_daily_series_with_diagnostics,
)

FIRST_YEAR = 1991
LAST_YEAR = 2025


@dataclass(frozen=True)
class TechnicalValidationError(RuntimeError):
    """Erreur exploitable par l'API, sans exposer les détails internes du serveur."""

    code: str
    message: str
    diagnostics: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def validate_temperature_series(series: pd.Series) -> None:
    """Vérifie que la série horaire couvre entièrement la période calculée.

    La règle est volontairement plus stricte que le calcul lui-même : chaque année
    de 1991 à 2025 doit atteindre la couverture journalière minimale du moteur.
    """

    if not isinstance(series.index, pd.DatetimeIndex) or series.empty:
        raise TechnicalValidationError("empty_temperature_series", "La série de température est absente ou vide.")
    if series.index.tz is None:
        raise TechnicalValidationError("temperature_timezone_missing", "Les horodatages de température doivent être en UTC.")
    if not series.index.is_unique:
        raise TechnicalValidationError("duplicate_timestamps", "La série de température contient des horodatages dupliqués.")
    if series.isna().any():
        raise TechnicalValidationError("missing_temperature_values", "La série de température contient des valeurs absentes.")
    if not all(math.isfinite(float(value)) for value in series.to_numpy()):
        raise TechnicalValidationError("non_finite_temperature_values", "La série de température contient des valeurs non finies.")

    expected = range(FIRST_YEAR, LAST_YEAR + 1)
    daily_by_year, diagnostics = prepare_daily_series_with_diagnostics(series, expected)
    minimum_days = math.ceil(NOLEAP_DAYS * MIN_YEAR_COVERAGE)
    invalid = {
        str(year): diagnostics[year]
        for year in expected
        if year not in daily_by_year
    }
    if invalid:
        raise TechnicalValidationError(
            "incomplete_temperature_coverage",
            "La série ERA5-Land ne couvre pas suffisamment toutes les années 1991–2025.",
            {"minimum_valid_days_per_year": minimum_days, "years": invalid},
        )


def validate_result(result: dict[str, Any]) -> None:
    """Contrôle les invariants techniques indispensables avant le rendu."""

    try:
        data = result["data"]
        thresholds = data["thresholds"]
        t25, t75 = thresholds["t25_c"], thresholds["t75_c"]
        decades = data["decades"]
    except (KeyError, TypeError) as exc:
        raise TechnicalValidationError("result_schema_invalid", "Le calcul n'a pas produit le schéma V4 attendu.") from exc

    if not _finite_number(t25) or not _finite_number(t75) or float(t25) >= float(t75):
        raise TechnicalValidationError("thresholds_invalid", "Les seuils thermiques calculés sont invalides.")

    for period in ("1996-2005", "2016-2025"):
        try:
            boundaries = decades[period]["canonical_boundaries"]
            values = [
                boundaries["spring_start"],
                boundaries["summer_start"],
                boundaries["autumn_start"],
                boundaries["winter_start"],
            ]
        except (KeyError, TypeError) as exc:
            raise TechnicalValidationError(
                "boundaries_missing", f"Les frontières thermiques de {period} sont absentes."
            ) from exc
        if not all(_finite_number(value) for value in values) or not (1 <= values[0] < values[1] < values[2] < values[3] <= 365):
            raise TechnicalValidationError(
                "boundaries_invalid", f"Les frontières thermiques de {period} sont incohérentes."
            )
