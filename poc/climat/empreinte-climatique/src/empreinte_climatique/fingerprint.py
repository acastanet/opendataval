"""Production de l'empreinte climatique annuelle d'un lieu.

Le module ne télécharge volontairement aucune donnée : les séries passées en entrée
proviennent du cache CDS. Cette séparation garantit qu'un rendu public ne dépend pas
d'un appel réseau et rend les calculs reproductibles dans les jobs de fabrication.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from html import escape
from math import ceil, copysign
from pathlib import Path
from typing import Literal
import json

import numpy as np
import pandas as pd


REFERENCE_START = 1991
REFERENCE_END = 2020
PERIOD_START = 1996
PERIOD_END = 2025
MIN_REFERENCE_YEARS = 24
MIN_DAILY_COVERAGE = 0.9


@dataclass(frozen=True)
class ClimateFingerprintInput:
    """Séries brutes indexées par date UTC.

    ``precipitation_m`` contient des accumulations par pas de temps en mètres.
    Les autres séries sont respectivement en °C, °C UTCI, indice SPEI-3 et m/s.
    """

    temperature_c: pd.Series
    utci_c: pd.Series
    precipitation_m: pd.Series
    spei3: pd.Series
    wind_speed_mps: pd.Series


@dataclass(frozen=True)
class MetricDefinition:
    identifier: str
    label: str
    source: str
    resolution: str
    metric: str
    unit: str
    classes: tuple[str, str, str, str, str]
    palette: tuple[str, str, str, str, str]


METRICS = (
    MetricDefinition(
        "temperature", "Température", "ERA5-Land", "0,1°",
        "annual_mean_2m_temperature", "°C",
        ("beaucoup plus froid", "plus froid", "près de la normale", "plus chaud", "beaucoup plus chaud"),
        ("#3b73a5", "#9cc4dd", "#e4ebe7", "#f3ad6a", "#ba3f33"),
    ),
    MetricDefinition(
        "utci", "Stress UTCI", "ERA5-HEAT", "0,25°",
        "annual_p95_daily_max_utci", "°C UTCI",
        ("stress thermique faible", "stress thermique modéré", "près de la normale", "stress thermique élevé", "stress thermique très élevé"),
        ("#d8e4e1", "#f0d58b", "#e4ebe7", "#ee9b52", "#a63d31"),
    ),
    MetricDefinition(
        "precipitation", "Précipitations", "ERA5-Land", "0,1°",
        "annual_total_precipitation", "mm",
        ("très sec", "sec", "près de la normale", "humide", "très humide"),
        ("#8d5d3d", "#d6ba8a", "#e4ebe7", "#91bdd4", "#2c6f9e"),
    ),
    MetricDefinition(
        "heavy_rain", "Pluies intenses", "ERA5-Land", "0,1°",
        "annual_days_above_reference_wet_day_p95", "jours",
        ("peu de pluies intenses", "pluies intenses rares", "près de la normale", "pluies intenses fréquentes", "pluies intenses très fréquentes"),
        ("#edf1ef", "#c9dfdc", "#e4ebe7", "#669fbb", "#215b8e"),
    ),
    MetricDefinition(
        "drought", "Sécheresse", "ERA5-Drought", "0,25°",
        "annual_months_below_calendar_month_spei3_p10", "mois",
        ("peu de sécheresse", "sécheresse limitée", "près de la normale", "sécheresse présente", "sécheresse très présente"),
        ("#edf1ef", "#e6d8ac", "#e4ebe7", "#c9944d", "#82502d"),
    ),
    MetricDefinition(
        "wind", "Vent fort", "ERA5", "0,25°",
        "annual_days_above_reference_daily_max_wind_p98", "jours",
        ("peu venteux", "vent peu marqué", "près de la normale", "venteux", "très venteux"),
        ("#edf1ef", "#d5cfdf", "#e4ebe7", "#9a88ac", "#554467"),
    ),
)


# Registre de présentation V4. Il est séparé des paramètres de calcul : aucune
# décision graphique ne peut modifier une valeur, une classe ou un événement.
# La sémantique est volontairement unique, y compris pour les précipitations :
# bleu = moins de la variable ; rouge = plus de la variable.
COMMON_PALETTE: tuple[tuple[float, str], ...] = (
    (0.00, "#2166AC"),
    (0.25, "#92C5DE"),
    (0.38, "#D1E5F0"),
    (0.44, "#F3F5F4"),
    (0.50, "#FBFAF7"),
    (0.56, "#F7F3EF"),
    (0.62, "#FDDBC7"),
    (0.75, "#F4A582"),
    (1.00, "#B2182B"),
)

# Paramètres d'échelle. La palette reste inchangée : c'est la position envoyée
# dans le dégradé qui décide si une année ordinaire reste blanche ou non.
ROBUST_SIGMA_FACTOR = 2.563   # écart P10–P90 d'une loi normale, exprimé en σ
EXCEPTIONAL_Z = 3.0           # écart standardisé saturant les extrémités
EMPHASIS_GAMMA = 2.0          # courbe d'accentuation des queues
EXCEPTIONAL_OFFSET = 0.10     # au-delà, une cellule est comptée « exceptionnelle »
BALANCE_FULL_SCALE = 0.3      # moyenne signée saturant la ligne bilan

# Le bilan n'est plus détaché par un trait : seul un interligne plus large le
# sépare des six indicateurs qui l'alimentent.
BALANCE_OFFSET = 10


@dataclass(frozen=True)
class RenderTheme:
    """Habillage du fond. Aucune valeur, classe ni couleur de cellule n'en dépend.

    ``band_relief`` pose sous chaque ligne une plaque légèrement ombrée : sur un
    fond neutre, la bande se détache comme un objet au lieu de se fondre dans la
    page. Le fond clair s'en passe, faute de contraste avec les cellules.
    """

    identifier: str
    background: str
    band_relief: bool


THEMES: dict[str, RenderTheme] = {
    "light": RenderTheme("light", "#FAFAF7", False),
    "neutral": RenderTheme("neutral", "#C5C4C1", True),  # #E8E7E3 assombri de 15 %
}

BAND_PLATE = "#FBFAF7"

EVENT_STYLE: dict[str, tuple[str, str, str]] = {
    "heat": ("triangle", "#A9362B", "chaleur"),
    "heavy_rain": ("circle", "#185A85", "pluie"),
    "drought": ("diamond", "#81512C", "sécheresse"),
    "wind": ("square", "#4E405F", "vent"),
    "cold": ("hexagon", "#5487A8", "froid"),
}


def _hex_rgb(color: str) -> tuple[int, int, int]:
    value = color.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def _interpolate_color(stops: tuple[tuple[float, str], ...], position: float) -> str:
    """Retourne une couleur continue, sans jamais interpoler entre les années."""
    position = min(1.0, max(0.0, position))
    for (left_position, left_color), (right_position, right_color) in zip(stops, stops[1:], strict=False):
        if position <= right_position:
            ratio = 0.0 if right_position == left_position else (position - left_position) / (right_position - left_position)
            left_rgb, right_rgb = _hex_rgb(left_color), _hex_rgb(right_color)
            rgb = tuple(round(a + (b - a) * ratio) for a, b in zip(left_rgb, right_rgb, strict=True))
            return "#" + "".join(f"{channel:02X}" for channel in rgb)
    return stops[-1][1]


def _robust_position(cell: dict[str, object], reference: object) -> float | None:
    """Position tirée de l'amplitude, et non du rang, quand la référence le permet.

    Le rang sature : toute année au-dessus du record 1991–2020 vaut P100, si bien
    que deux records d'intensité très différente sortent de la même couleur. On
    préfère donc un écart standardisé robuste, borné à ``EXCEPTIONAL_Z`` sigmas.
    """
    value = cell.get("value")
    if not isinstance(value, (int, float)) or not isinstance(reference, dict):
        return None
    p10, p50, p90 = reference.get("p10"), reference.get("p50"), reference.get("p90")
    if not all(isinstance(threshold, (int, float)) for threshold in (p10, p50, p90)):
        return None
    spread = (float(p90) - float(p10)) / ROBUST_SIGMA_FACTOR
    if spread <= 0:
        return None
    z = (float(value) - float(p50)) / spread
    return min(1.0, max(0.0, 0.5 + z / (2 * EXCEPTIONAL_Z)))


def _cell_position(cell: dict[str, object], reference: object = None) -> float:
    """Position relative V4, avec un garde-fou pour les ex æquo."""
    robust = _robust_position(cell, reference)
    if robust is not None:
        return robust
    class_index = cell.get("class_index")
    fallback_position = (0.00, 0.25, 0.50, 0.75, 1.00)[class_index] if isinstance(class_index, int) and 0 <= class_index <= 4 else 0.50
    percentile = cell.get("percentile")
    if isinstance(percentile, (int, float)):
        position = float(percentile) / 100
        # Un percentile empirique avec ex æquo peut placer une valeur minimale à
        # P100 (par exemple une longue suite de zéros). La classe calculée reste
        # alors la meilleure information pour respecter « rouge = plus ».
        if isinstance(class_index, int) and abs(position - fallback_position) > 0.55:
            position = fallback_position
    else:
        position = fallback_position
    return min(1.0, max(0.0, position))


def _emphasise(position: float) -> float:
    """Écrase la variabilité courante vers le blanc et dilate les queues.

    Sans cette courbe, la moitié des années sont teintées par construction et le
    bleu comme le rouge perdent leur valeur d'alerte. Le gamma est calibré pour
    qu'un écart de 1 σ reste imperceptible, que 2 σ se voie nettement et que
    ``EXCEPTIONAL_Z`` sature la palette.
    """
    offset = position - 0.5
    return 0.5 + copysign(abs(offset / 0.5) ** EMPHASIS_GAMMA, offset) / 2


def _emphasised_position(cell: dict[str, object], reference: object = None) -> float:
    """Seule position utilisée par le rendu : amplitude puis accentuation."""
    return _emphasise(_cell_position(cell, reference))


def _cell_color(row_id: str, cell: dict[str, object], reference: object = None) -> str:
    """Couleur V4 commune issue de l'écart accentué à la référence.

    ``row_id`` reste un argument de compatibilité, mais il ne doit jamais
    infléchir la palette : rouge signifie toujours « plus ».
    """
    return _interpolate_color(COMMON_PALETTE, _emphasised_position(cell, reference))


def _utc_series(values: pd.Series) -> pd.Series:
    if not isinstance(values.index, pd.DatetimeIndex):
        raise ValueError("Une série climatique doit être indexée par date")
    index = values.index.tz_localize("UTC") if values.index.tz is None else values.index.tz_convert("UTC")
    result = pd.Series(pd.to_numeric(values, errors="coerce").to_numpy(dtype=float), index=index)
    return result[~result.index.duplicated(keep="last")].sort_index()


def _daily(values: pd.Series, operation: Literal["mean", "max", "sum"]) -> pd.Series:
    series = _utc_series(values)
    if operation == "sum":
        return series.resample("1D").sum(min_count=1)
    return getattr(series.resample("1D"), operation)()


def _year_complete(values: pd.Series, year: int, expected: int) -> bool:
    actual = int(values[values.index.year == year].notna().sum())
    return actual >= ceil(expected * MIN_DAILY_COVERAGE)


def _annual_daily(values: pd.Series, reducer: Literal["mean", "p95", "sum", "count"], *, threshold: float | None = None) -> dict[int, float | None]:
    result: dict[int, float | None] = {}
    for year in range(REFERENCE_START, PERIOD_END + 1):
        expected = 366 if date(year, 12, 31).timetuple().tm_yday == 366 else 365
        if not _year_complete(values, year, expected):
            result[year] = None
            continue
        current = values.loc[str(year)].dropna()
        if reducer == "mean":
            result[year] = float(current.mean())
        elif reducer == "p95":
            result[year] = float(np.quantile(current, 0.95))
        elif reducer == "sum":
            result[year] = float(current.sum())
        elif threshold is not None:
            result[year] = float((current > threshold).sum())
        else:
            raise ValueError("Un seuil est requis pour compter les jours")
    return result


def _annual_month_count(values: pd.Series, monthly_thresholds: dict[int, float]) -> dict[int, float | None]:
    result: dict[int, float | None] = {}
    for year in range(REFERENCE_START, PERIOD_END + 1):
        current = values.loc[str(year)].dropna()
        if len(set(zip(current.index.year, current.index.month, strict=True))) < 12:
            result[year] = None
            continue
        result[year] = float(sum(value < monthly_thresholds[timestamp.month] for timestamp, value in current.items()))
    return result


def _reference_values(annual: dict[int, float | None]) -> np.ndarray:
    return np.asarray([
        value for year, value in annual.items()
        if REFERENCE_START <= year <= REFERENCE_END and value is not None
    ], dtype=float)


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None or not np.isfinite(value) else round(float(value), digits)


def _thresholds(reference: np.ndarray) -> dict[str, float | None]:
    if len(reference) < MIN_REFERENCE_YEARS:
        return {name: None for name in ("p10", "p33_3", "p50", "p66_6", "p90", "mean")}
    return {
        "p10": _round(float(np.quantile(reference, 0.10))),
        "p33_3": _round(float(np.quantile(reference, 0.333))),
        "p50": _round(float(np.quantile(reference, 0.50))),
        "p66_6": _round(float(np.quantile(reference, 0.666))),
        "p90": _round(float(np.quantile(reference, 0.90))),
        "mean": _round(float(reference.mean())),
    }


def _classify(value: float | None, thresholds: dict[str, float | None]) -> int | None:
    if value is None or any(thresholds[key] is None for key in ("p10", "p33_3", "p66_6", "p90")):
        return None
    if value <= float(thresholds["p10"]):
        return 0
    if value <= float(thresholds["p33_3"]):
        return 1
    if value <= float(thresholds["p66_6"]):
        return 2
    if value <= float(thresholds["p90"]):
        return 3
    return 4


def _rank(value: float | None, visible: dict[int, float | None]) -> int | None:
    if value is None:
        return None
    ordered = sorted((item for item in visible.values() if item is not None), reverse=True)
    return ordered.index(value) + 1


def _years(metric: MetricDefinition, annual: dict[int, float | None], details: dict[int, dict[str, float | None]]) -> tuple[list[dict[str, object]], dict[str, float | None]]:
    reference = _reference_values(annual)
    thresholds = _thresholds(reference)
    visible = {year: annual[year] for year in range(PERIOD_START, PERIOD_END + 1)}
    rows: list[dict[str, object]] = []
    for year, value in visible.items():
        category = _classify(value, thresholds)
        percentile = None if value is None or len(reference) < MIN_REFERENCE_YEARS else _round(100 * float((reference <= value).mean()), 1)
        rows.append({
            "year": year,
            "value": _round(value),
            "anomaly": _round(None if value is None or thresholds["mean"] is None else value - float(thresholds["mean"])),
            "percentile": percentile,
            "class_index": category,
            "class": None if category is None else metric.classes[category],
            "rank": _rank(value, visible),
            "details": {key: _round(detail) for key, detail in details.get(year, {}).items()},
        })
    return rows, thresholds


def _comparison(metric: MetricDefinition, annual: dict[int, float | None]) -> dict[str, float | None | str]:
    early = [annual[year] for year in range(1996, 2006) if annual[year] is not None]
    late = [annual[year] for year in range(2016, 2026) if annual[year] is not None]
    early_mean = None if len(early) < 8 else float(np.mean(early))
    late_mean = None if len(late) < 8 else float(np.mean(late))
    delta = None if early_mean is None or late_mean is None else late_mean - early_mean
    relative_pct = None if early_mean in {None, 0} or delta is None else 100 * delta / early_mean
    if delta is None:
        display = "donnée insuffisante"
        qualifier = ""
    elif metric.identifier == "precipitation":
        display = f"{relative_pct:+.0f} %" if relative_pct is not None else f"Δ {delta:+.0f} mm"
        qualifier = "variabilité élevée" if abs(relative_pct or 0) < 15 else "à interpréter avec prudence"
    elif metric.identifier in {"temperature", "utci"}:
        display = f"{delta:+.2f} {metric.unit}"
        qualifier = "comparaison des décennies"
    else:
        suffix = "jours/an" if metric.unit == "jours" else "mois/an"
        display = f"{delta:+.1f} {suffix}"
        qualifier = "pas d’évolution nette" if abs(delta) < 0.5 else "comparaison des décennies"
    return {
        "early_mean": _round(early_mean),
        "late_mean": _round(late_mean),
        "delta": _round(delta),
        "relative_pct": _round(relative_pct, 1),
        "display": display,
        "qualifier": qualifier,
    }


def _summary(comparisons: dict[str, dict[str, float | None | str]]) -> str:
    temperature = comparisons["temperature"].get("delta")
    precipitation = comparisons["precipitation"].get("relative_pct")
    drought = comparisons["drought"].get("delta")
    parts = []
    if isinstance(temperature, float) and temperature > 0.3:
        parts.append("Le signal le plus net est thermique")
    if isinstance(precipitation, float) and abs(precipitation) < 15:
        parts.append("les précipitations annuelles restent très variables")
    if isinstance(drought, float) and drought >= 0.5:
        parts.append("les épisodes secs sont plus fréquents dans la dernière décennie")
    if not parts:
        return "Les indicateurs présentent une variabilité interannuelle marquée sur la période."
    return " ; ".join(parts) + "."


def _group_exceedances(
    values: pd.Series,
    threshold: float,
    family: str,
    label: str,
    *,
    low: bool = False,
    max_gap_days: int = 1,
) -> list[dict[str, object]]:
    filtered = values[(values <= threshold) if low else (values > threshold)]
    filtered = filtered[(filtered.index.year >= PERIOD_START) & (filtered.index.year <= PERIOD_END)].dropna()
    events: list[dict[str, object]] = []
    group: list[tuple[pd.Timestamp, float]] = []
    for timestamp, value in filtered.items():
        if group and (timestamp - group[-1][0]).days > max_gap_days:
            events.append(_event_from_group(group, family, label, threshold, low=low))
            group = []
        group.append((timestamp, float(value)))
    if group:
        events.append(_event_from_group(group, family, label, threshold, low=low))
    return events


def _event_from_group(group: list[tuple[pd.Timestamp, float]], family: str, label: str, threshold: float, *, low: bool) -> dict[str, object]:
    peak = min(value for _, value in group) if low else max(value for _, value in group)
    intensity = (threshold - peak) if low else (peak - threshold)
    return {
        "date_start": group[0][0].date().isoformat(),
        "date_end": group[-1][0].date().isoformat(),
        "family": family,
        "label": label,
        "severity": _round(intensity),
        "metrics": {"threshold": _round(threshold), "peak": _round(peak)},
        "label_status": "automatic",
    }


def _selected_events(candidates: list[dict[str, object]]) -> list[dict[str, object]]:
    selected: list[dict[str, object]] = []
    by_family: dict[str, int] = {}
    for candidate in sorted(candidates, key=lambda item: float(item["severity"] or 0), reverse=True):
        family = str(candidate["family"])
        if by_family.get(family, 0) >= 2 or len(selected) >= 8:
            continue
        selected.append(candidate)
        by_family[family] = by_family.get(family, 0) + 1
    return sorted(selected, key=lambda item: str(item["date_start"]))


def build_climate_fingerprint(data: ClimateFingerprintInput, *, tile_id: str, latitude: float, longitude: float) -> dict[str, object]:
    """Construit le contrat de données et les candidats événements d'une dalle."""
    temperature_daily = _daily(data.temperature_c, "mean")
    utci_daily = _daily(data.utci_c, "max")
    precipitation_daily = _daily(data.precipitation_m, "sum") * 1000
    wind_daily = _daily(data.wind_speed_mps, "max")
    spei_monthly = _utc_series(data.spei3).resample("MS").mean()

    temperature = _annual_daily(temperature_daily, "mean")
    utci = _annual_daily(utci_daily, "p95")
    precipitation = _annual_daily(precipitation_daily, "sum")

    wet_reference = precipitation_daily.loc[f"{REFERENCE_START}":f"{REFERENCE_END}"]
    wet_reference = wet_reference[wet_reference >= 1].dropna()
    rain_threshold = float(np.quantile(wet_reference, 0.95)) if len(wet_reference) else float("nan")
    heavy_rain = _annual_daily(precipitation_daily, "count", threshold=rain_threshold)
    wind_reference = wind_daily.loc[f"{REFERENCE_START}":f"{REFERENCE_END}"].dropna()
    wind_threshold = float(np.quantile(wind_reference, 0.98)) if len(wind_reference) else float("nan")
    wind = _annual_daily(wind_daily, "count", threshold=wind_threshold)

    monthly_thresholds = {
        month: float(np.quantile(spei_monthly[(spei_monthly.index.year >= REFERENCE_START) & (spei_monthly.index.year <= REFERENCE_END) & (spei_monthly.index.month == month)].dropna(), 0.10))
        for month in range(1, 13)
    }
    drought = _annual_month_count(spei_monthly, monthly_thresholds)

    utci_details = {
        year: {
            "jours_ge_32_c_utci": float((utci_daily.loc[str(year)] >= 32).sum()),
            "jours_ge_38_c_utci": float((utci_daily.loc[str(year)] >= 38).sum()),
            "maximum_c_utci": float(utci_daily.loc[str(year)].max()),
        }
        for year in range(REFERENCE_START, PERIOD_END + 1)
    }
    rain_details = {
        year: {"cumul_jours_intenses_mm": float(precipitation_daily.loc[str(year)][precipitation_daily.loc[str(year)] > rain_threshold].sum())}
        for year in range(REFERENCE_START, PERIOD_END + 1)
    }
    drought_details = {
        year: {"spei3_minimum": float(spei_monthly.loc[str(year)].min())}
        for year in range(REFERENCE_START, PERIOD_END + 1)
    }
    wind_details = {
        year: {"maximum_m_s": float(wind_daily.loc[str(year)].max())}
        for year in range(REFERENCE_START, PERIOD_END + 1)
    }

    annual_by_metric = (temperature, utci, precipitation, heavy_rain, drought, wind)
    details_by_metric = ({}, utci_details, {}, rain_details, drought_details, wind_details)
    rows = []
    comparisons: dict[str, dict[str, float | None | str]] = {}
    for metric, annual, details in zip(METRICS, annual_by_metric, details_by_metric, strict=True):
        years, thresholds = _years(metric, annual, details)
        rows.append({
            "id": metric.identifier,
            "label": metric.label,
            "source": metric.source,
            "resolution": metric.resolution,
            "metric": metric.metric,
            "unit": metric.unit,
            "classes": list(metric.classes),
            "palette": list(metric.palette),
            "reference": thresholds,
            "years": years,
        })
        comparisons[metric.identifier] = _comparison(metric, annual)

    heat_reference = utci_daily.loc[f"{REFERENCE_START}":f"{REFERENCE_END}"].dropna()
    candidates: list[dict[str, object]] = []
    if len(heat_reference):
        candidates.extend(_group_exceedances(utci_daily, float(np.quantile(heat_reference, 0.99)), "heat", "stress thermique exceptionnel"))
    if len(wet_reference):
        candidates.extend(_group_exceedances(precipitation_daily, float(np.quantile(wet_reference, 0.99)), "heavy_rain", "épisode de pluie extrême"))
    if len(wind_reference):
        candidates.extend(_group_exceedances(wind_daily, float(np.quantile(wind_reference, 0.99)), "wind", "épisode de vent extrême"))
    spei_reference = spei_monthly.loc[f"{REFERENCE_START}":f"{REFERENCE_END}"].dropna()
    if len(spei_reference):
        candidates.extend(_group_exceedances(
            spei_monthly,
            float(np.quantile(spei_reference, 0.01)),
            "drought",
            "séquence de sécheresse",
            low=True,
            max_gap_days=35,
        ))

    return {
        "tile_id": tile_id,
        "point": {"lat": _round(latitude, 6), "lon": _round(longitude, 6)},
        "period": {"start": PERIOD_START, "end": PERIOD_END},
        "reference": {"start": REFERENCE_START, "end": REFERENCE_END, "minimum_complete_years": MIN_REFERENCE_YEARS},
        "rows": rows,
        "events": _selected_events(candidates),
        "comparison": {"early": "1996-2005", "late": "2016-2025", "metrics": comparisons},
        "summary": _summary(comparisons),
        "provenance": {
            "disclaimer": "Contexte climatique du lieu — données de réanalyse sur grille, non mesurées à l'échelle de la dalle.",
            "generated_by": "empreinte_climatique.fingerprint",
        },
    }


def _event_shape(shape: str, x: float, y: float, color: str) -> str:
    if shape == "triangle":
        return f'<polygon points="{x},{y - 5} {x + 5},{y + 4} {x - 5},{y + 4}" fill="{color}"/>'
    if shape == "diamond":
        return f'<polygon points="{x},{y - 5} {x + 5},{y} {x},{y + 5} {x - 5},{y}" fill="{color}"/>'
    if shape == "square":
        return f'<rect x="{x - 4}" y="{y - 4}" width="8" height="8" rx="0.5" fill="{color}"/>'
    if shape == "hexagon":
        return f'<polygon points="{x - 4},{y - 3} {x},{y - 5} {x + 4},{y - 3} {x + 4},{y + 3} {x},{y + 5} {x - 4},{y + 3}" fill="{color}"/>'
    return f'<circle cx="{x}" cy="{y}" r="4.5" fill="{color}"/>'


def _cell_tooltip(row: dict[str, object], cell: dict[str, object]) -> str:
    label, year, unit = str(row.get("label", "Indicateur")), cell.get("year"), str(row.get("unit", ""))
    if cell.get("applicable") is False:
        return f"{year} — {label}\nIndicateur non pertinent pour ce lieu"
    if cell.get("value") is None:
        return f"{year} — {label}\nDonnée indisponible"
    lines = [f"{year} — {label}", f"Valeur : {cell['value']} {unit}"]
    if cell.get("anomaly") is not None:
        lines.append(f"Écart vs 1991–2020 : {cell['anomaly']:+} {unit}")
    if cell.get("percentile") is not None:
        lines.append(f"Percentile : P{cell['percentile']}")
    if cell.get("class"):
        lines.append(f"Classe : {cell['class']}")
    lines.append(f"Source : {row.get('source', 'réanalyse climatique')}")
    return "\n".join(lines)


def _balance_metrics(rows: list[object], index: int) -> tuple[float, int, int, int]:
    """Moyenne signée des écarts accentués d'une année.

    L'indice est signé : un indicateur exceptionnellement bas tire vers le bleu,
    un indicateur exceptionnellement haut vers le rouge, et une année ordinaire
    reste blanche. La contrepartie assumée est la compensation, que le tooltip
    rend explicite en publiant séparément les deux comptes.
    """
    offsets: list[float] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        years = row.get("years", [])
        if not isinstance(years, list) or index >= len(years) or not isinstance(years[index], dict):
            continue
        cell = years[index]
        if cell.get("value") is None or cell.get("applicable") is False:
            continue
        offsets.append(_emphasised_position(cell, row.get("reference")) - 0.5)
    count = len(offsets)
    mean = sum(offsets) / count if count else 0.0
    above = sum(offset >= EXCEPTIONAL_OFFSET for offset in offsets)
    below = sum(offset <= -EXCEPTIONAL_OFFSET for offset in offsets)
    return mean, above, below, count


def _balance_cell(rows: list[object], index: int, year: int) -> tuple[str, str]:
    """Couleur et explication de l'indice d'empreinte bilan annuel."""
    # ``BALANCE_FULL_SCALE`` sature la ligne bien avant le maximum théorique : une
    # moyenne de 0,3 correspond déjà à une majorité d'indicateurs autour de 2 σ,
    # soit une année remarquable sur tous les fronts.
    mean, above, below, count = _balance_metrics(rows, index)
    scaled = min(1.0, max(-1.0, mean / BALANCE_FULL_SCALE))
    color = _interpolate_color(COMMON_PALETTE, 0.5 + scaled / 2)
    tooltip = (
        f"{year} — Empreinte bilan\n"
        f"Indice signé : {scaled:+.0%}\n"
        f"Exceptionnellement hauts : {above} / {count}\n"
        f"Exceptionnellement bas : {below} / {count}\n"
        "Un excès et un déficit simultanés se compensent dans l'indice."
    )
    return color, tooltip


def render_climate_fingerprint_svg(fingerprint: dict[str, object], *, theme: str = "light") -> str:
    """Rend l'empreinte V4, compacte et sans les événements exceptionnels.

    ``theme`` ne change que l'habillage du fond : ``light`` publie la version de
    référence, ``neutral`` pose les bandes en relief sur un gris neutre.
    """
    rows = fingerprint["rows"]
    if not isinstance(rows, list) or len(rows) != 6:
        raise ValueError("Contrat d'empreinte invalide : six lignes attendues")
    if theme not in THEMES:
        raise ValueError(f"Thème de rendu inconnu : {theme!r}")
    palette_theme = THEMES[theme]

    cell_width, cell_height, row_gap = 18, 34, 4
    left, top = 218, 142
    matrix_width = 30 * cell_width
    matrix_height = 7 * cell_height + 6 * row_gap + BALANCE_OFFSET
    width, height, delta_x = 1080, 526, left + matrix_width + 34
    missing, not_applicable = False, False

    def column_x(index: int) -> int:
        return left + index * cell_width

    def band_relief(y: int) -> list[str]:
        """Plaque ombrée posée sous une bande, uniquement sur fond neutre.

        L'ombre est portée par une forme pleine et connue plutôt que par le
        groupe de cellules : le résultat ne dépend alors pas de la façon dont le
        moteur compose trente rectangles jointifs.
        """
        if not palette_theme.band_relief:
            return []
        return [f'<rect x="{left}" y="{y}" width="{matrix_width}" height="{cell_height}" fill="{BAND_PLATE}" filter="url(#band-shadow)"/>']

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title description">',
        '<title id="title">L’empreinte climatique du lieu</title>',
        '<desc id="description">Trente années, de 1996 à 2025, pour six indicateurs comparés au climat de référence 1991 à 2020, six séries et un indice d’empreinte bilan annuel.</desc>',
        '<defs><pattern id="missing" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#F1F2F0"/><line x1="0" y1="0" x2="0" y2="6" stroke="#AEB7B3" stroke-width="1.5"/></pattern><pattern id="not-applicable" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#F7F6F2"/><circle cx="2.5" cy="2.5" r="0.8" fill="#AFAFA8"/></pattern>',
        '<filter id="band-shadow" x="-2%" y="-60%" width="104%" height="240%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#1C2529" flood-opacity="0.22"/></filter>',
        '<linearGradient id="common-gradient" x1="0" x2="1" y1="0" y2="0">',
        *[f'<stop offset="{position * 100:.0f}%" stop-color="{color}"/>' for position, color in COMMON_PALETTE],
        '</linearGradient>',
        '</defs>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#24313A}.title{font-size:23px;font-weight:650}.subtitle{font-size:14px;font-weight:500;fill:#52616A}.meta,.year,.legend,.qualifier{font-size:10px;fill:#52616A}.row{font-size:14px;font-weight:650}.delta{font-size:14px;font-weight:650}.comparison-title{font-size:12px;font-weight:650}</style>',
        f'<rect width="{width}" height="{height}" fill="{palette_theme.background}"/>',
        '<text x="40" y="42" class="title">L’empreinte climatique du lieu</text>',
        '<text x="40" y="64" class="subtitle">Qu’est-ce qui a changé en trente ans ?</text>',
        '<text x="40" y="84" class="meta">1996–2025 · référence 1991–2020</text>',
        f'<text x="{delta_x}" y="98" class="comparison-title">Écart entre</text>',
        f'<text x="{delta_x}" y="114" class="comparison-title">les décennies</text>',
    ]

    # Aucun cartouche de fond : la bande de trente ans doit se lire d'un trait.
    # La décennie n'est portée que par son libellé et, plus bas, par un filet.
    for decade, start in (("1996–2005", 0), ("2006–2015", 10), ("2016–2025", 20)):
        center = column_x(start) + 5 * cell_width
        parts.append(f'<text x="{center:.1f}" y="108" class="year" text-anchor="middle">{decade}</text>')
    # Seules les bornes de décennie sont annotées ; les repères intermédiaires
    # (2000, 2010, 2020) n'ajoutaient rien que la position des cellules ne donne déjà.
    for index, year in enumerate(range(PERIOD_START, PERIOD_END + 1)):
        if year in {1996, 2005, 2015, 2025}:
            x = column_x(index) + cell_width / 2
            parts.append(f'<text x="{x:.1f}" y="127" class="year" text-anchor="middle">{year}</text>')

    comparison = fingerprint.get("comparison", {})
    comparisons = comparison.get("metrics", {}) if isinstance(comparison, dict) else {}
    for row_index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        row_id = str(row.get("id", "temperature"))
        y = top + row_index * (cell_height + row_gap)
        parts.append(f'<text x="{left - 14}" y="{y + 21}" class="row" text-anchor="end">{escape(str(row.get("label", "Indicateur")))}</text>')
        parts.extend(band_relief(y))
        years = row.get("years", [])
        if isinstance(years, list):
            for index, cell in enumerate(years):
                if not isinstance(cell, dict):
                    continue
                if cell.get("applicable") is False:
                    color, not_applicable = "url(#not-applicable)", True
                elif cell.get("value") is None:
                    color, missing = "url(#missing)", True
                else:
                    color = _cell_color(row_id, cell, row.get("reference"))
                x = column_x(index)
                tooltip = escape(_cell_tooltip(row, cell))
                parts.append(f'<rect x="{x}" y="{y}" width="{cell_width}" height="{cell_height}" fill="{color}"><title>{tooltip}</title></rect>')
        metric_comparison = comparisons.get(row_id, {}) if isinstance(comparisons, dict) else {}
        delta_label = str(metric_comparison.get("display", "donnée insuffisante")) if isinstance(metric_comparison, dict) else "donnée insuffisante"
        qualifier = str(metric_comparison.get("qualifier", "")) if isinstance(metric_comparison, dict) else ""
        parts.append(f'<text x="{delta_x}" y="{y + 18}" class="delta">{escape(delta_label)}</text>')
        if qualifier in {"variabilité élevée", "pas d’évolution nette"}:
            parts.append(f'<text x="{delta_x}" y="{y + 32}" class="qualifier">{escape(qualifier)}</text>')

    # Ligne de synthèse : moyenne signée des écarts accentués de l'année. Aucun
    # trait ne la détache, l'interligne élargi suffit à la distinguer des six
    # indicateurs qui l'alimentent.
    balance_y = top + 6 * (cell_height + row_gap) + BALANCE_OFFSET
    parts.append(f'<text x="{left - 14}" y="{balance_y + 21}" class="row" text-anchor="end">Empreinte bilan</text>')
    parts.extend(band_relief(balance_y))
    for index, year in enumerate(range(PERIOD_START, PERIOD_END + 1)):
        color, tooltip = _balance_cell(rows, index, year)
        x = column_x(index)
        parts.append(f'<rect x="{x}" y="{balance_y}" width="{cell_width}" height="{cell_height}" fill="{color}"><title>{escape(tooltip)}</title></rect>')

    # Filets décennaux posés après les cellules pour rester visibles par-dessus.
    # Le ton sombre est le seul lisible à la fois sur le blanc central et sur les
    # extrémités mi-lumineuses de la palette. La sur-longueur reste courte en
    # haut pour ne pas mordre sur le libellé d'année voisin, dont la base est à 123.
    for boundary in (10, 20):
        filet_x = column_x(boundary)
        parts.append(f'<line x1="{filet_x}" y1="{top - 4}" x2="{filet_x}" y2="{balance_y + cell_height + 4}" stroke="#24313A" stroke-width="1" stroke-dasharray="2 3" opacity="0.45"/>')

    # Légende centrée sous la matrice plutôt qu'alignée à gauche : la barre et
    # ses deux bornes forment un groupe symétrique dont le centre coïncide avec
    # le centre de la matrice.
    matrix_center = left + matrix_width / 2
    bar_width = 220
    bar_x = matrix_center - bar_width / 2
    legend_y = top + matrix_height + 44
    parts.append(f'<text x="{matrix_center:.1f}" y="{legend_y - 7}" class="legend" text-anchor="middle">Écart à la référence 1991–2020, accentué sur les extrêmes</text>')
    parts.append(f'<text x="{bar_x - 10:.1f}" y="{legend_y + 12}" class="legend" text-anchor="end">−3 σ</text>')
    parts.append(f'<rect x="{bar_x:.1f}" y="{legend_y + 3}" width="{bar_width}" height="10" fill="url(#common-gradient)"/>')
    parts.append(f'<text x="{bar_x + bar_width + 10:.1f}" y="{legend_y + 12}" class="legend">+3 σ</text>')
    parts.append(f'<text x="{matrix_center:.1f}" y="{legend_y + 27}" class="legend" text-anchor="middle">une année ordinaire reste blanche · seul l’exceptionnel se colore</text>')
    if missing or not_applicable:
        states = []
        if missing:
            states.append("hachures : donnée indisponible")
        if not_applicable:
            states.append("points : indicateur non pertinent")
        parts.append(f'<text x="{matrix_center:.1f}" y="{legend_y + 44}" class="legend" text-anchor="middle">{escape(" · ".join(states))}</text>')
    parts.append('</svg>')
    return "\n".join(parts)


def render_exceptional_events_svg(fingerprint: dict[str, object]) -> str:
    """Premier composant V4 dédié aux événements, séparé de la matrice."""
    width, height, left, timeline_y = 900, 190, 60, 132
    timeline_width = width - left * 2
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title description">',
        '<title id="title">Événements exceptionnels</title>',
        '<desc id="description">Événements climatiques exceptionnels détectés entre 1996 et 2025.</desc>',
        '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#24313A}.title{font-size:18px;font-weight:650}.meta,.event{font-size:10px;fill:#52616A}</style>',
        f'<rect width="{width}" height="{height}" fill="#FAFAF7"/>',
        '<text x="60" y="32" class="title">Événements exceptionnels</text>',
        '<text x="60" y="51" class="meta">Épisodes détectés dans les séries réelles · 1996–2025</text>',
        f'<line x1="{left}" y1="{timeline_y}" x2="{left + timeline_width}" y2="{timeline_y}" stroke="#AEB7B3" stroke-width="1"/>',
    ]
    for year in (1996, 2000, 2005, 2010, 2015, 2020, 2025):
        x = left + (year - PERIOD_START) / (PERIOD_END - PERIOD_START) * timeline_width
        parts.append(f'<text x="{x:.1f}" y="{timeline_y + 20}" class="meta" text-anchor="middle">{year}</text>')

    lane_last_x = [-999.0, -999.0, -999.0]
    events = fingerprint.get("events", [])
    event_items = [event for event in events if isinstance(event, dict)] if isinstance(events, list) else []
    for event in sorted(event_items, key=lambda item: str(item.get("date_start", ""))):
        try:
            year = int(str(event.get("date_start", ""))[:4])
        except ValueError:
            continue
        if not PERIOD_START <= year <= PERIOD_END:
            continue
        x = left + (year - PERIOD_START) / (PERIOD_END - PERIOD_START) * timeline_width
        lane = next((index for index, previous_x in enumerate(lane_last_x) if x - previous_x >= 72), 2)
        lane_last_x[lane] = x
        y = 93 - lane * 20
        family = str(event.get("family", ""))
        shape, color, short_label = EVENT_STYLE.get(family, ("circle", "#52616A", "événement"))
        label = escape(str(event.get("label", short_label)))
        date_start = escape(str(event.get("date_start", "")))
        date_end = escape(str(event.get("date_end", "")))
        parts.append(f'<line x1="{x:.1f}" y1="{y + 6}" x2="{x:.1f}" y2="{timeline_y}" stroke="{color}" stroke-width="1.25" opacity="0.55"/>')
        parts.append(f'<g><title>{label} — {date_start} à {date_end}</title>{_event_shape(shape, x, y, color)}</g>')
        parts.append(f'<text x="{x:.1f}" y="{y - 8}" class="event" text-anchor="middle">{short_label}</text>')
    parts.append('</svg>')
    return "\n".join(parts)


def write_climate_fingerprint(output_directory: Path, fingerprint: dict[str, object]) -> tuple[Path, Path]:
    """Écrit les deux artefacts publiables du snapshot de dalle."""
    output_directory.mkdir(parents=True, exist_ok=True)
    json_path = output_directory / "climate-fingerprint.json"
    svg_path = output_directory / "climate-fingerprint.svg"
    json_path.write_text(json.dumps(fingerprint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    svg_path.write_text(render_climate_fingerprint_svg(fingerprint), encoding="utf-8")
    return json_path, svg_path


def write_climate_fingerprint_v4(output_directory: Path, fingerprint: dict[str, object]) -> tuple[Path, Path, Path, Path]:
    """Écrit les quatre livrables V4 sans recalculer ni transformer les données.

    Les deux matrices ne diffèrent que par leur habillage : mêmes valeurs, mêmes
    couleurs de cellule, seul le fond change.
    """
    output_directory.mkdir(parents=True, exist_ok=True)
    json_path = output_directory / "climate-fingerprint-v4.json"
    svg_path = output_directory / "climate-fingerprint-v4.svg"
    neutral_path = output_directory / "climate-fingerprint-v4-neutral.svg"
    events_path = output_directory / "exceptional-events-v4.svg"
    json_path.write_text(json.dumps(fingerprint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    svg_path.write_text(render_climate_fingerprint_svg(fingerprint), encoding="utf-8")
    neutral_path.write_text(render_climate_fingerprint_svg(fingerprint, theme="neutral"), encoding="utf-8")
    events_path.write_text(render_exceptional_events_svg(fingerprint), encoding="utf-8")
    return json_path, svg_path, neutral_path, events_path
