"""CLI de l'empreinte climatique OpenDataVal.

Exemples
--------
Prototype avec données fictives (aucun appel réseau) :
    python cli.py synthetic --out out

Empreinte réelle d'une dalle (CDS, ~3 min la première fois, instantané ensuite) :
    python cli.py build --tile ODV-VALLERAUGUE-001 --lat 44.06465 --lon 3.68293
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from fingerprint import TileRequest, build_fingerprint, render_svg
from fingerprint.model import PERIOD_END, PERIOD_START, REF_END, REF_START


def _common(p):
    p.add_argument("--period", nargs=2, type=int, default=[PERIOD_START, PERIOD_END])
    p.add_argument("--reference", nargs=2, type=int, default=[REF_START, REF_END])
    p.add_argument("--out", default="out")


def main() -> int:
    ap = argparse.ArgumentParser(prog="fingerprint")
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="empreinte reelle depuis le CDS")
    b.add_argument("--tile", required=True)
    b.add_argument("--lat", type=float, required=True)
    b.add_argument("--lon", type=float, required=True)
    b.add_argument("--force", action="store_true", help="ignore le cache disque")
    b.add_argument("--no-events", action="store_true")
    _common(b)

    s = sub.add_parser("synthetic", help="prototype avec donnees fictives")
    s.add_argument("--tile", default="ODV-SYNTH-001")
    s.add_argument("--lat", type=float, default=44.06465)
    s.add_argument("--lon", type=float, default=3.68293)
    s.add_argument("--seed", type=int, default=42)
    _common(s)

    a = ap.parse_args()
    tile = TileRequest(tile_id=a.tile, lat=a.lat, lon=a.lon,
                       period=tuple(a.period), reference_period=tuple(a.reference))
    out = Path(a.out)

    if a.cmd == "synthetic":
        from fingerprint.synthetic import synthetic_annual
        annual, extras, events = synthetic_annual(
            a.seed, y0=min(tile.collect_years), y1=max(tile.collect_years))
        fp = build_fingerprint(tile, annual, extras,
                               provenance={"mode": "synthetic",
                                           "warning": "DONNEES FICTIVES — aucun resultat climatique reel"})
        fp.events = events
        out.mkdir(parents=True, exist_ok=True)
        (out / "climate-fingerprint.json").write_text(
            json.dumps(fp.to_json(), indent=2, ensure_ascii=False), encoding="utf-8")
        svg = out / "climate-fingerprint.svg"
        svg.write_text(render_svg(fp, "L'empreinte climatique — PROTOTYPE (donnees fictives)"),
                       encoding="utf-8")
        (out / "preview.html").write_text(
            "<!doctype html><meta charset='utf-8'><body style='margin:0'>"
            + svg.read_text(encoding="utf-8") + "</body>", encoding="utf-8")
        print(f"[synthetic] {svg}")
    else:
        from fingerprint.pipeline import run_pipeline
        res = run_pipeline(tile, out, force=a.force, with_events=not a.no_events)
        fp = res["fingerprint"]
        print(f"[build] {res['svg']}")
        print(f"[build] {res['json']}")
        for r in fp.rows:
            d = r.decade_delta.get("delta")
            print(f"  {r.label:16} {('%+.2f' % d) if d is not None else '  n/d':>8} {r.unit:6}"
                  f"  {r.trend.get('verdict','')}")
        print(f"  evenements retenus : {len(fp.events)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
