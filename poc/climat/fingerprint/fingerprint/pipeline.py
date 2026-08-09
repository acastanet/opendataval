"""Pipeline complet : collecte CDS → agrégations → empreinte → JSON + SVG."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from collectors import cds
from .build import build_fingerprint
from .events import (detect_daily_extremes, detect_drought_sequences,
                     select_events)
from .model import TileRequest
from .render_svg import render_svg


def run_pipeline(tile: TileRequest, outdir: Path, force: bool = False,
                 with_events: bool = True) -> dict[str, Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    y0, y1 = min(tile.collect_years), max(tile.collect_years)
    ref = tile.reference_period
    prov: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "requested_point": {"lat": tile.lat, "lon": tile.lon},
        "collected_years": [y0, y1],
        "note": ("Contexte climatique du lieu — données de réanalyse sur grille. "
                 "Ces valeurs ne décrivent pas le climat mesuré dans les 100 x 100 m."),
        "sources": {},
    }

    # --- Collecte -------------------------------------------------------
    p_land = cds.fetch_era5land(tile.lat, tile.lon, y0, y1, force)
    p_wind = cds.fetch_wind(tile.lat, tile.lon, y0, y1, force)
    p_utci = cds.fetch_utci(tile.lat, tile.lon, y0, y1, force)
    p_spei = cds.fetch_spei(tile.lat, tile.lon, y0, y1, force)

    # --- Agrégations ----------------------------------------------------
    temp, grid_land = cds.aggregate_temperature(p_land)
    precip, xrain, ex_p, ex_x, meta_p, daily_rain = cds.aggregate_precip(p_land, ref)
    utci, ex_u, daily_utci = cds.aggregate_utci(p_utci)
    wind, ex_w, daily_wind, meta_w = cds.aggregate_wind(p_wind, ref)
    drought, ex_d, spei_series, spei_p10, grid_spei = cds.aggregate_spei(
        p_spei, ref, tile.lat, tile.lon)

    annual = {"temperature": temp, "utci": utci, "precipitation": precip,
              "extreme_rain": xrain, "drought": drought, "wind": wind}
    extras = {"precipitation": ex_p, "extreme_rain": ex_x, "utci": ex_u,
              "wind": ex_w, "drought": ex_d}

    prov["sources"] = {
        "temperature": _src("ERA5-Land timeseries", "0.1 degree", tile, grid_land),
        "precipitation": _src("ERA5-Land timeseries", "0.1 degree", tile, grid_land,
                              wetday_p95_mm=round(meta_p["wetday_p95_mm"], 2)),
        "utci": _src("ERA5-HEAT timeseries (ARCO)", "0.25 degree", tile, {}),
        "wind": _src("ERA5-Land timeseries (u10/v10)", "0.1 degree", tile, grid_land,
                     wind_p98_ms=round(meta_w["wind_p98_ms"], 2),
                     note="rafale ERA5 quotidienne volontairement non utilisee (probleme CDS connu)"),
        "drought": _src("ERA5-Drought SPEI-3", "0.25 degree", tile, grid_spei),
    }

    fp = build_fingerprint(tile, annual, extras, provenance=prov)

    # --- Événements ------------------------------------------------------
    if with_events:
        fp.events = _detect_events(daily_utci, daily_rain, daily_wind,
                                   spei_series, spei_p10, ref, tile.period)

    # --- Sorties ---------------------------------------------------------
    js = outdir / "climate-fingerprint.json"
    sv = outdir / "climate-fingerprint.svg"
    js.write_text(json.dumps(fp.to_json(), indent=2, ensure_ascii=False), encoding="utf-8")
    sv.write_text(render_svg(fp), encoding="utf-8")
    _write_preview(outdir, sv)
    return {"json": js, "svg": sv, "fingerprint": fp}


def _src(name: str, res: str, tile: TileRequest, grid: dict, **kw) -> dict:
    d = {"dataset": name, "resolution": res, "retrieved": datetime.now(timezone.utc)
         .isoformat(timespec="seconds")}
    d.update(grid)
    if "grid_lat" in grid:
        d["distance_km"] = round(_haversine(tile.lat, tile.lon,
                                            grid["grid_lat"], grid["grid_lon"]), 2)
    d.update(kw)
    return d


def _haversine(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = np.radians(lat2 - lat1), np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return float(2 * r * np.arcsin(np.sqrt(a)))


def _detect_events(daily_utci, daily_rain, daily_wind, spei, spei_p10, ref, period):
    """Candidats détectés sur toute la série, puis restreints à la période racontée.

    Le filtrage doit avoir lieu AVANT `select_events`, sinon un extrême de
    1991-1995 (présent pour la référence mais invisible sur la matrice)
    consomme un des 8 emplacements d'annotation.
    """
    r0, r1 = ref
    p0, p1 = period
    cands = []

    def mask(idx):
        return [(r0 <= d.year <= r1) for d in idx]

    for series, family, thr in ((daily_utci, "heat", 99.5),
                                (daily_rain, "heavy_rain", 99.5),
                                (daily_wind, "wind", 99.5)):
        dates = [d.strftime("%Y-%m-%d") for d in series.index]
        cands += detect_daily_extremes(dates, list(series.values),
                                       mask(series.index), family, thr)

    months = [d.strftime("%Y-%m") for d in spei.index]
    cands += detect_drought_sequences(months, list(spei.values), spei_p10)

    cands = [e for e in cands if p0 <= e.year <= p1]
    return select_events(cands)


def _write_preview(outdir: Path, svg: Path) -> None:
    (outdir / "preview.html").write_text(
        "<!doctype html><meta charset='utf-8'>"
        "<body style='margin:0;background:#fff'>" + svg.read_text(encoding="utf-8")
        + "</body>", encoding="utf-8")
