"""Collecteurs CDS — une requête « timeseries » par source quand c'est possible.

Choix de conception validés par sondage réel du catalogue (2026-08) :

* ERA5-Land **timeseries** accepte `location` + une plage de 35 ans en une seule
  requête (~1 min, 4 Mo). On l'utilise pour température, précipitations ET vent.
* Le vent est donc pris dans ERA5-Land plutôt que dans `reanalysis-era5-single-levels`
  (bien plus lourd), et calculé à partir de `u10`/`v10` — jamais à partir du
  paramètre de rafale signalé comme problématique par le CDS (spec §10).
* UTCI utilise `derived-utci-historical-timeseries` (ARCO/Zarr), également une
  seule requête, au lieu des 420 requêtes mensuelles de `derived-utci-historical`.
* SPEI utilise `derived-drought-historical-monthly` avec une petite `area`,
  clés exactes : product_type=['reanalysis'], dataset_type='consolidated_dataset'.
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

CACHE = Path(__file__).resolve().parent.parent / "cache"
CACHE.mkdir(exist_ok=True)


def _client():
    import cdsapi
    return cdsapi.Client()


def _read_csv_members(path: Path) -> dict[str, pd.DataFrame]:
    """Lit un ZIP CDS (ou un CSV nu) et retourne {nom_membre: DataFrame}.

    Le CDS renvoie parfois un CSV *nu* sous une extension `.zip`
    (cas de derived-utci-historical-timeseries). On sniffe donc la signature
    `PK` au lieu de se fier au nom, et on force `compression=None` sinon
    pandas tente de décompresser d'après l'extension et lève BadZipFile.
    """
    with path.open("rb") as fh:
        magic = fh.read(2)
    if magic != b"PK":
        return {path.name: pd.read_csv(path, compression=None)}
    out = {}
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if name.lower().endswith(".csv"):
                out[name] = pd.read_csv(io.BytesIO(z.read(name)))
    return out


def _retrieve(dataset: str, request: dict[str, Any], target: Path,
              force: bool = False) -> Path:
    """Télécharge si absent du cache. Le cache disque évite de replonger dans la file CDS."""
    if target.exists() and not force:
        return target
    _client().retrieve(dataset, request, str(target))
    return target


# --- ERA5-Land : température + précipitations --------------------------------

def fetch_era5land(lat: float, lon: float, y0: int, y1: int,
                   force: bool = False) -> Path:
    tgt = CACHE / f"era5land_{y0}_{y1}.zip"
    return _retrieve("reanalysis-era5-land-timeseries", {
        "variable": ["2m_temperature", "total_precipitation"],
        "location": {"latitude": lat, "longitude": lon},
        "date": [f"{y0}-01-01/{y1}-12-31"],
        "data_format": "csv",
    }, tgt, force)


def fetch_wind(lat: float, lon: float, y0: int, y1: int,
               force: bool = False) -> Path:
    tgt = CACHE / f"wind_{y0}_{y1}.zip"
    return _retrieve("reanalysis-era5-land-timeseries", {
        "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
        "location": {"latitude": lat, "longitude": lon},
        "date": [f"{y0}-01-01/{y1}-12-31"],
        "data_format": "csv",
    }, tgt, force)


def fetch_utci(lat: float, lon: float, y0: int, y1: int,
               force: bool = False) -> Path:
    tgt = CACHE / f"utci_{y0}_{y1}.zip"
    return _retrieve("derived-utci-historical-timeseries", {
        "variable": ["universal_thermal_climate_index"],
        "location": {"latitude": lat, "longitude": lon},
        "date": [f"{y0}-01-01/{y1}-12-31"],
        "data_format": "csv",
    }, tgt, force)


def fetch_spei(lat: float, lon: float, y0: int, y1: int,
               force: bool = False) -> Path:
    tgt = CACHE / f"spei3_{y0}_{y1}.zip"
    half = 0.25
    return _retrieve("derived-drought-historical-monthly", {
        "product_type": ["reanalysis"],
        "dataset_type": "consolidated_dataset",
        "version": "1_0",
        "variable": ["standardised_precipitation_evapotranspiration_index"],
        "accumulation_period": ["3"],
        "year": [str(y) for y in range(y0, y1 + 1)],
        "month": [f"{m:02d}" for m in range(1, 13)],
        "area": [lat + half, lon - half, lat - half, lon + half],
        "data_format": "netcdf",
    }, tgt, force)


# --- Parsing / agrégation ----------------------------------------------------

def _pick(dfs: dict[str, pd.DataFrame], col: str) -> pd.DataFrame:
    for name, df in dfs.items():
        if col in df.columns:
            d = df[["valid_time", col]].copy()
            d["valid_time"] = pd.to_datetime(d["valid_time"])
            return d.set_index("valid_time").sort_index()
    raise KeyError(f"colonne {col} absente ({list(dfs)})")


def _grid_point(dfs: dict[str, pd.DataFrame]) -> dict[str, float]:
    for df in dfs.values():
        if "latitude" in df.columns:
            return {"grid_lat": float(df["latitude"].iloc[0]),
                    "grid_lon": float(df["longitude"].iloc[0])}
    return {}


def aggregate_temperature(path: Path) -> tuple[dict[int, float], dict[str, Any]]:
    """K → °C, moyenne annuelle sur années civiles complètes."""
    dfs = _read_csv_members(path)
    s = _pick(dfs, "t2m")["t2m"] - 273.15
    ann = s.groupby(s.index.year).mean()
    counts = s.groupby(s.index.year).count()
    ann = ann[counts >= 8000]  # exclut toute année civile incomplète (spec §22)
    return {int(y): float(v) for y, v in ann.items()}, _grid_point(dfs)


def _daily_precip_mm(path: Path) -> pd.Series:
    """Cumul quotidien en mm à partir des `tp` horaires d'ERA5-Land timeseries.

    ATTENTION — piège vérifié sur les données réelles (2026-08) : contrairement
    aux produits ERA5 GRIB classiques où `tp` est un cumul croissant depuis 00 UTC,
    le service *timeseries* renvoie des **incréments horaires déjà dé-cumulés**
    (la série décroît puis retombe à zéro dans la même journée). Il faut donc
    SOMMER les heures, surtout pas prendre le maximum : le max sous-estimait le
    cumul annuel d'un facteur ~6 (194 mm/an au lieu de ~1200 mm dans les Cévennes).
    """
    dfs = _read_csv_members(path)
    tp = _pick(dfs, "tp")["tp"].clip(lower=0) * 1000.0  # m → mm
    daily = tp.groupby(tp.index.date).sum()
    daily.index = pd.to_datetime(daily.index)
    return daily


def aggregate_precip(path: Path, ref: tuple[int, int]):
    """Cumul annuel, jours de pluie, jours > P95 des jours humides de la référence."""
    daily = _daily_precip_mm(path)
    years = daily.index.year
    full = daily.groupby(years).count() >= 360
    total = daily.groupby(years).sum()[full]
    wetdays = daily[daily >= 1.0]
    nwet = wetdays.groupby(wetdays.index.year).count().reindex(total.index).fillna(0)

    r0, r1 = ref
    ref_wet = wetdays[(wetdays.index.year >= r0) & (wetdays.index.year <= r1)]
    p95 = float(np.percentile(ref_wet.values, 95)) if len(ref_wet) else float("nan")

    hard = daily[daily > p95]
    ndays = hard.groupby(hard.index.year).count().reindex(total.index).fillna(0)
    r95ptot = hard.groupby(hard.index.year).sum().reindex(total.index).fillna(0)

    precip = {int(y): float(v) for y, v in total.items()}
    xrain = {int(y): float(v) for y, v in ndays.items()}
    extras_p = {int(y): {"jours de pluie": int(n)} for y, n in nwet.items()}
    extras_x = {int(y): {"R95pTOT (mm)": round(float(r95ptot.loc[y]), 1),
                         "seuil P95 reference (mm/j)": round(p95, 1)}
                for y in total.index}
    return precip, xrain, extras_p, extras_x, {"wetday_p95_mm": p95}, daily


def aggregate_utci(path: Path):
    """P95 annuel des maxima quotidiens UTCI + compteurs de jours de stress."""
    dfs = _read_csv_members(path)
    col = next((c for c in ("utci", "UTCI") for d in dfs.values() if c in d.columns), None)
    if col is None:
        cands = {c for d in dfs.values() for c in d.columns} - {"valid_time", "latitude", "longitude"}
        col = sorted(cands)[0]
    s = _pick(dfs, col)[col]
    if float(s.max()) > 100:  # série en kelvin
        s = s - 273.15
    dmax = s.groupby(s.index.date).max()
    dmax.index = pd.to_datetime(dmax.index)
    years = dmax.index.year
    full = dmax.groupby(years).count() >= 360

    p95 = dmax.groupby(years).quantile(0.95)[full]
    d32 = dmax[dmax >= 32].groupby(lambda d: d.year).count()
    d38 = dmax[dmax >= 38].groupby(lambda d: d.year).count()
    amax = dmax.groupby(years).max()

    out = {int(y): float(v) for y, v in p95.items()}
    extras = {int(y): {"jours >= 32 degC UTCI": int(d32.get(y, 0)),
                       "jours >= 38 degC UTCI": int(d38.get(y, 0)),
                       "maximum annuel (degC)": round(float(amax.get(y, float('nan'))), 1)}
              for y in p95.index}
    return out, extras, dmax


def aggregate_wind(path: Path, ref: tuple[int, int]):
    """Vitesse = sqrt(u10²+v10²), max quotidien, jours > P98 de la référence."""
    dfs = _read_csv_members(path)
    u = _pick(dfs, "u10")["u10"]
    v = _pick(dfs, "v10")["v10"]
    spd = np.sqrt(u ** 2 + v ** 2)
    dmax = spd.groupby(spd.index.date).max()
    dmax.index = pd.to_datetime(dmax.index)
    years = dmax.index.year
    full = dmax.groupby(years).count() >= 360

    r0, r1 = ref
    refv = dmax[(dmax.index.year >= r0) & (dmax.index.year <= r1)]
    p98 = float(np.percentile(refv.values, 98))
    hits = dmax[dmax > p98]
    ndays = hits.groupby(hits.index.year).count()
    amax = dmax.groupby(years).max()

    idx = [int(y) for y in dmax.groupby(years).count()[full].index]
    out = {y: float(ndays.get(y, 0)) for y in idx}
    extras = {y: {"maximum quotidien (m/s)": round(float(amax.get(y, float('nan'))), 1),
                  "seuil P98 reference (m/s)": round(p98, 1)} for y in idx}
    return out, extras, dmax, {"wind_p98_ms": p98}


def aggregate_spei(path: Path, ref: tuple[int, int], lat: float, lon: float):
    """Nombre de mois « très secs » : SPEI-3 sous le P10 du même mois calendaire.

    ATTENTION — `derived-drought-historical-monthly` renvoie **un fichier NetCDF
    par mois** (420 membres pour 35 ans), et non un cube unique. Il faut donc
    tous les extraire et les concaténer sur `time` : n'ouvrir que le premier
    membre donne une seule date et zéro année complète.
    """
    import xarray as xr

    with path.open("rb") as fh:
        is_zip = fh.read(2) == b"PK"

    if is_zip:
        workdir = CACHE / f"_spei_nc_{path.stem}"
        workdir.mkdir(exist_ok=True)
        with zipfile.ZipFile(path) as z:
            members = [n for n in z.namelist() if n.endswith(".nc")]
            for n in members:
                tgt = workdir / Path(n).name
                if not tgt.exists():
                    tgt.write_bytes(z.read(n))
        files = sorted(workdir.glob("*.nc"))
        # Concaténation manuelle plutôt qu'open_mfdataset : les 420 fichiers font
        # 72 octets chacun, et open_mfdataset exigerait une dépendance dask
        # disproportionnée pour ce volume.
        parts = []
        for f in files:
            with xr.open_dataset(f, engine="netcdf4") as d:
                parts.append(d.load())
        ds = xr.concat(parts, dim="time").sortby("time")
    else:
        ds = xr.open_dataset(path)

    name = next(n for n in ds.data_vars if "spei" in n.lower())
    da = ds[name]
    latn = "lat" if "lat" in da.dims else "latitude"
    lonn = "lon" if "lon" in da.dims else "longitude"
    pt = da.sel({latn: lat, lonn: lon}, method="nearest")
    if "realization" in pt.dims:
        pt = pt.isel(realization=0)

    ser = pt.to_series().dropna().sort_index()
    ser.index = pd.to_datetime(ser.index)

    r0, r1 = ref
    refser = ser[(ser.index.year >= r0) & (ser.index.year <= r1)]
    p10 = {int(m): float(np.percentile(g.values, 10))
           for m, g in refser.groupby(refser.index.month) if len(g) >= 10}

    very_dry = pd.Series(
        [1.0 if (m in p10 and val < p10[m]) else 0.0
         for m, val in zip(ser.index.month, ser.values)],
        index=ser.index)

    n_months = ser.groupby(ser.index.year).count()
    counts = very_dry.groupby(very_dry.index.year).sum()
    counts = counts[n_months.reindex(counts.index).fillna(0) >= 12]
    smin = ser.groupby(ser.index.year).min()

    out = {int(y): float(v) for y, v in counts.items()}
    extras = {int(y): {"SPEI-3 minimum": round(float(smin.get(y, float('nan'))), 2)}
              for y in counts.index}
    grid = {"grid_lat": float(pt[latn].values), "grid_lon": float(pt[lonn].values)}
    return out, extras, ser, p10, grid
