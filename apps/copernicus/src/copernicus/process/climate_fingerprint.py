"""Production de l'empreinte climatique annuelle d'un lieu.

Le module ne télécharge volontairement aucune donnée : les séries passées en entrée
proviennent du cache CDS. Cette séparation garantit qu'un rendu public ne dépend pas
d'un appel réseau et rend les calculs reproductibles dans les jobs de fabrication.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from html import escape
from math import ceil
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
            "generated_by": "apps/copernicus/process/climate_fingerprint.py",
        },
    }


def render_climate_fingerprint_svg(fingerprint: dict[str, object]) -> str:
    """Rend un SVG autonome, accessible et cohérent avec le contrat JSON."""
    rows = fingerprint["rows"]
    if not isinstance(rows, list):
        raise ValueError("Contrat d'empreinte invalide : rows absent")
    cell_width, cell_height, left, top = 19, 52, 225, 142
    matrix_width = cell_width * 30
    matrix_height = cell_height * len(rows)
    width, height = 1260, top + matrix_height + 58
    summary = escape(str(fingerprint.get("summary", "")))
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title description">',
        '<title id="title">L’empreinte climatique, 1996 à 2025</title>',
        '<desc id="description">Matrice annuelle de six indicateurs, comparés à la référence 1991 à 2020.</desc>',
        '<defs><pattern id="missing" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#eef0ef"/><line x1="0" y1="0" x2="0" y2="6" stroke="#b7bfbc" stroke-width="2"/></pattern><pattern id="not-applicable" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#faf9f5"/><circle cx="2.5" cy="2.5" r="0.8" fill="#aaa"/></pattern></defs>',
        '<style>text{font-family:Arial,sans-serif;fill:#24313a}.small{font-size:11px}.label{font-size:14px;font-weight:600}.legend{font-size:10px;fill:#52616a}.delta{font-size:13px;font-weight:600}.qualifier{font-size:10px;fill:#52616a}</style>',
        f'<text x="{left}" y="27" class="label">L’empreinte climatique</text>',
        f'<text x="{left}" y="47" class="small">30 années comparées au climat de référence 1991–2020</text>',
        f'<text x="{left}" y="66" class="small">{summary}</text>',
        f'<text x="{left - 12}" y="91" text-anchor="end" class="label">Événements</text>',
        f'<line x1="{left}" y1="108" x2="{left + matrix_width}" y2="108" stroke="#aeb9b6" stroke-width="1"/>',
    ]
    for offset, year in enumerate(range(PERIOD_START, PERIOD_END + 1)):
        if offset % 5 == 0 or year == PERIOD_END:
            parts.append(f'<text x="{left + offset * cell_width + 1}" y="130" class="small">{year}</text>')
    event_colors = {"heat": "#ba3f33", "heavy_rain": "#215b8e", "drought": "#82502d", "wind": "#554467"}
    event_rows = {
        "heat": {"temperature", "utci", "drought"},
        "heavy_rain": {"precipitation", "heavy_rain"},
        "drought": {"drought", "temperature"},
        "wind": {"wind"},
    }
    cell_events: dict[tuple[str, int], str] = {}
    events = fingerprint.get("events", [])
    if isinstance(events, list):
        for event_index, event in enumerate(events):
            if not isinstance(event, dict):
                continue
            try:
                year = int(str(event["date_start"])[:4])
            except (KeyError, ValueError):
                continue
            x = left + (year - PERIOD_START) * cell_width + cell_width / 2
            family = str(event.get("family"))
            color = event_colors.get(family, "#24313a")
            label = escape(str(event.get("label", "événement exceptionnel")))
            event_y = 93 if event_index % 2 == 0 else 78
            parts.append(f'<line x1="{x}" y1="{event_y + 4}" x2="{x}" y2="108" stroke="{color}" stroke-width="1" opacity="0.65"/>')
            parts.append(f'<circle cx="{x}" cy="{event_y}" r="4" fill="{color}"><title>{label}</title></circle>')
            parts.append(f'<text x="{x + 7}" y="{event_y + 4}" class="small">{year}</text>')
            for row_id in event_rows.get(family, set()):
                cell_events[(row_id, year)] = color
    for boundary in (10, 20):
        x = left + boundary * cell_width - 0.5
        parts.append(f'<line x1="{x}" y1="{top - 5}" x2="{x}" y2="{top + matrix_height - 10}" stroke="#8d9995" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>')
    comparison = fingerprint.get("comparison", {})
    comparisons = comparison.get("metrics", {}) if isinstance(comparison, dict) else {}
    for row_index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        y = top + row_index * cell_height
        label = escape(str(row.get("label", "Indicateur")))
        unit = escape(str(row.get("unit", "")))
        classes = row.get("classes", [])
        palette = row.get("palette", [])
        years = row.get("years", [])
        parts.append(f'<text x="{left - 12}" y="{y + 18}" text-anchor="end" class="label">{label}</text>')
        if isinstance(classes, list) and len(classes) == 5:
            legend = escape(f'{classes[0]} — normal — {classes[-1]}')
            parts.append(f'<text x="{left - 12}" y="{y + 34}" text-anchor="end" class="legend">{legend}</text>')
        if isinstance(years, list) and isinstance(palette, list):
            for index, cell in enumerate(years):
                if not isinstance(cell, dict):
                    continue
                class_index = cell.get("class_index")
                color = "url(#missing)" if not isinstance(class_index, int) else str(palette[class_index])
                if cell.get("applicable") is False:
                    color = "url(#not-applicable)"
                value = "donnée incomplète" if cell.get("value") is None else f'{cell.get("value")} {unit}'
                description = escape(f'{cell.get("year")} — {label} : {value}; {cell.get("class") or "non classé"}')
                x = left + index * cell_width
                year = int(cell.get("year", PERIOD_START + index))
                stroke = cell_events.get((str(row.get("id")), year), "none")
                parts.append(f'<rect x="{x}" y="{y}" width="{cell_width - 1}" height="{cell_height - 12}" rx="2" fill="{color}" stroke="{stroke}" stroke-width="2"><title>{description}</title></rect>')
        metric_comparison = comparisons.get(str(row.get("id")), {}) if isinstance(comparisons, dict) else {}
        delta_label = str(metric_comparison.get("display", "donnée insuffisante")) if isinstance(metric_comparison, dict) else "donnée insuffisante"
        qualifier = str(metric_comparison.get("qualifier", "")) if isinstance(metric_comparison, dict) else ""
        parts.append(f'<text x="{left + matrix_width + 24}" y="{y + 18}" class="delta">{escape(delta_label)}</text>')
        parts.append(f'<text x="{left + matrix_width + 24}" y="{y + 34}" class="qualifier">{escape(qualifier)}</text>')
    parts.append(f'<text x="{left + matrix_width + 24}" y="130" class="small">1996–2005 → 2016–2025</text>')
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
