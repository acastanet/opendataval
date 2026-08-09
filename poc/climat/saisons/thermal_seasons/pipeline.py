"""Orchestration : données -> calcul -> document JSON complet (§23)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from . import schema
from .aggregate import annual_durations, decade_shift, summarize
from .crossings import detect_crossings
from .data import prepare_daily_series_with_diagnostics
from .noleap import noleap_doy_to_month_day
from .reference import build_climatology, compute_thresholds
from .smoothing import fit_rmse, smooth_annual
from .validate import growing_season_5c, qa_annual


def _decade_label(year: int) -> str | None:
    if 1996 <= year <= 2005:
        return "1996-2005"
    if 2006 <= year <= 2015:
        return "2006-2015"
    if 2016 <= year <= 2025:
        return "2016-2025"
    return None


def compute(temperature_c, *, tile_id: str, lat=None, lon=None, grid_lat=None,
            grid_lon=None, retrieved_at=None, credentials_source=None) -> dict:
    document = schema.empty_document(tile_id, lat, lon)
    document["source"].update({
        "grid_lat": grid_lat, "grid_lon": grid_lon,
        "retrieved_at": retrieved_at, "credentials_source": credentials_source,
    })

    # 1. Séries quotidiennes no-leap par année (1991–2025 pour la référence).
    daily_by_year, daily_diagnostics = prepare_daily_series_with_diagnostics(
        temperature_c, range(1991, 2026)
    )

    missing_reference = [year for year in range(1991, 2021) if year not in daily_by_year]
    if missing_reference:
        raise ValueError(
            "Référence 1991–2020 incomplète : années insuffisamment couvertes "
            + ", ".join(str(year) for year in missing_reference)
        )

    # 2. Climatologie de référence + seuils T25/T75 (calculés UNE fois).
    climatology = build_climatology(daily_by_year)
    t25, t75 = compute_thresholds(climatology)
    document["thresholds"]["t25_c"] = round(t25, 3)
    document["thresholds"]["t75_c"] = round(t75, 3)

    # 3. Calcul annuel : lissage, crossings, durées, validation secondaire.
    crossings_by_year: dict[int, object] = {}
    durations_by_year: dict[int, object] = {}
    for year in range(1996, 2026):
        entry = next(e for e in document["annual"] if e["year"] == year)
        arr = daily_by_year.get(year)
        entry["interpolated_days"] = daily_diagnostics.get(year, {}).get("interpolated_days", 0)
        if arr is None or np_isnan_all(arr):
            entry["status"] = "insufficient_data"
            continue
        smoothed = smooth_annual(arr)
        rmse = fit_rmse(smoothed, arr)
        crossings = detect_crossings(smoothed, t25, t75)
        next_year = year + 1
        next_arr = daily_by_year.get(next_year)
        next_cross = detect_crossings(smooth_annual(next_arr), t25, t75) if next_arr is not None else None
        next_spring = next_cross.spring_start if next_cross else None
        durations = annual_durations(crossings, next_spring) if crossings else None
        qa = qa_annual(crossings, durations)

        if crossings is None or not qa.ok:
            entry["status"] = qa.reason or "invalid_crossings"
            # On conserve néanmoins RMSE et la saison de croissance si possible.
        else:
            entry.update({
                "spring_start_doy": round(crossings.spring_start, 2),
                "summer_start_doy": round(crossings.summer_start, 2),
                "autumn_start_doy": round(crossings.autumn_start, 2),
                "winter_start_doy": round(crossings.winter_start, 2),
                "spring_length_days": round(durations.spring_length, 2),
                "summer_length_days": round(durations.summer_length, 2),
                "autumn_length_days": round(durations.autumn_length, 2),
                "winter_length_days": (round(durations.winter_length, 2)
                                       if durations.winter_length is not None else None),
            })
        entry["fit_rmse_c"] = round(float(rmse), 3)
        crossings_by_year[year] = crossings
        durations_by_year[year] = durations

        # Validation secondaire : saison de croissance > 5 °C (§24).
        gs = growing_season_5c(arr)
        entry["growing_season_start_doy"] = round(gs.start, 2) if gs.start is not None else None
        entry["growing_season_end_doy"] = round(gs.end, 2) if gs.end is not None else None
        entry["growing_season_length_days"] = round(gs.length, 2) if gs.length is not None else None

    # 4. Agrégation décennale (§12) sur les années valides.
    for label in ("1996-2005", "2006-2015", "2016-2025"):
        years = [e["year"] for e in document["annual"]
                 if e["status"] == "ok" and _decade_label(e["year"]) == label]
        if not years:
            continue
        entries = [e for e in document["annual"] if e["year"] in years]
        dec = {}
        for key, field in (
            ("spring_start", "spring_start_doy"),
            ("summer_start", "summer_start_doy"),
            ("autumn_start", "autumn_start_doy"),
            ("winter_start", "winter_start_doy"),
        ):
            dec[key] = summarize([e[field] for e in entries])
        for key, field in (
            ("spring_length", "spring_length_days"),
            ("summer_length", "summer_length_days"),
            ("autumn_length", "autumn_length_days"),
            ("winter_length", "winter_length_days"),
        ):
            values = [e[field] for e in entries if e[field] is not None]
            if values:
                dec[key] = summarize(values)
        document["decades"][label] = dec

    # 5. Comparaison principale EARLY vs LATE + changement durée été (§13–§14).
    early_years = [e for e in document["annual"] if _decade_label(e["year"]) == "1996-2005" and e["status"] == "ok"]
    late_years = [e for e in document["annual"] if _decade_label(e["year"]) == "2016-2025" and e["status"] == "ok"]

    def _col(entries, field):
        return [e[field] for e in entries]

    comp = document["comparison"]
    comp["spring_start_shift_days"] = _round(shift_or_none(early_years, late_years, "spring_start_doy"))
    comp["summer_start_shift_days"] = _round(shift_or_none(early_years, late_years, "summer_start_doy"))
    comp["autumn_start_shift_days"] = _round(shift_or_none(early_years, late_years, "autumn_start_doy"))
    comp["winter_start_shift_days"] = _round(shift_or_none(early_years, late_years, "winter_start_doy"))

    early_summer = [e["summer_length_days"] for e in early_years if e["summer_length_days"] is not None]
    late_summer = [e["summer_length_days"] for e in late_years if e["summer_length_days"] is not None]
    if early_summer and late_summer:
        from .aggregate import _percentiles
        _, em, _ = _percentiles(early_summer)
        _, lm, _ = _percentiles(late_summer)
        comp["summer_length_change_days"] = _round(lm - em)
    else:
        comp["summer_length_change_days"] = None

    # 6. Diagnostics qualité.
    ok_years = sum(1 for e in document["annual"] if e["status"] == "ok")
    document["quality"] = {
        "annual_ok": ok_years,
        "annual_total": 30,
        "t25_c": round(t25, 3),
        "t75_c": round(t75, 3),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # 7. Validation secondaire agrégée (moyenne de la longueur de saison >5°C).
    gs_lengths = [e["growing_season_length_days"] for e in document["annual"]
                  if e["growing_season_length_days"] is not None]
    document["validation"] = {
        "method": "copernicus_growing_season_5c",
        "growing_season_length_median_days": round(float(__import__("numpy").median(gs_lengths)), 2) if gs_lengths else None,
        "note": "Contrôle secondaire uniquement ; non affiché dans le SVG V1.",
    }
    return document


def _round(v) -> float | None:
    if v is None:
        return None
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def shift_or_none(early_entries, late_entries, field) -> float | None:
    from .aggregate import _percentiles
    ev = [e[field] for e in early_entries if e[field] is not None]
    lv = [e[field] for e in late_entries if e[field] is not None]
    if not ev or not lv:
        return None
    _, em, _ = _percentiles(ev)
    _, lm, _ = _percentiles(lv)
    if __import__("numpy").isnan(em) or __import__("numpy").isnan(lm):
        return None
    return lm - em


def np_isnan_all(arr) -> bool:
    import numpy as np
    return bool(np.all(np.isnan(arr)))
