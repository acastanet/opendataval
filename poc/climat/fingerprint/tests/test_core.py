"""Tests du noyau statistique et du rendu (aucun appel réseau)."""
from __future__ import annotations

import json
import math

import numpy as np
import pytest

from fingerprint import TileRequest, build_fingerprint, render_svg
from fingerprint.events import Event, detect_daily_extremes, select_events
from fingerprint.stats import (classify, decade_delta, mann_kendall,
                               percentile_of, ranks, reference_stats, theil_sen)
from fingerprint.synthetic import synthetic_annual


def test_reference_stats_breaks_ordered():
    r = reference_stats(list(range(100)))
    assert r["P10"] < r["P33.3"] < r["P50"] < r["P66.6"] < r["P90"]
    assert r["n"] == 100


def test_percentile_and_classes():
    ref = list(range(100))  # 0..99
    assert classify(percentile_of(2, ref)) == "very_low"
    assert classify(percentile_of(50, ref)) == "near_normal"
    assert classify(percentile_of(98, ref)) == "very_high"


def test_percentile_handles_ties():
    """Les comptages entiers (jours, mois) produisent beaucoup d'ex aequo."""
    ref = [0, 0, 0, 0, 5, 5, 10, 10, 10, 10]
    p = percentile_of(5, ref)
    assert 0 < p < 100
    assert not math.isnan(p)


def test_ranks_descending():
    assert ranks([1.0, 3.0, 2.0]) == [3, 1, 2]
    assert ranks([1.0, None, 2.0])[1] is None


def test_theil_sen_recovers_known_slope():
    years = list(range(1991, 2026))
    values = [10 + 0.05 * (y - 1991) for y in years]
    t = theil_sen(years, values)
    assert t["slope_per_year"] == pytest.approx(0.05, abs=1e-9)
    assert t["slope_per_decade"] == pytest.approx(0.5, abs=1e-9)


def test_mann_kendall_detects_and_rejects():
    inc = list(np.arange(30, dtype=float))
    assert mann_kendall(inc)["verdict"] == "tendance nette"
    rng = np.random.default_rng(0)
    flat = list(rng.normal(0, 1, 30))
    assert mann_kendall(flat)["verdict"] != "tendance nette"


def test_decade_delta():
    years = list(range(1996, 2026))
    vals = [0.0] * 10 + [0.0] * 10 + [2.0] * 10
    d = decade_delta(years, vals, (1996, 2005), (2016, 2025))
    assert d["delta"] == pytest.approx(2.0)


def test_event_selection_enforces_diversity():
    cands = [Event(f"2000-01-0{i%9+1}", "2000-01-09", "heavy_rain", 99.0 + i * 0.01)
             for i in range(20)]
    cands += [Event("2005-07-01", "2005-07-05", "heat", 99.9)]
    sel = select_events(cands)
    assert len(sel) <= 8
    assert sum(1 for e in sel if e.family == "heavy_rain") <= 2
    assert any(e.family == "heat" for e in sel)


def test_detect_daily_extremes_merges_episodes():
    """Deux jours consécutifs au-dessus du seuil = un seul épisode.

    NB : la référence doit être assez longue pour que le percentile ne soit pas
    tiré par les extrêmes eux-mêmes (avec 20 points, P95 tombe sur l'extrême).
    """
    dates = [f"2000-{m:02d}-{d:02d}" for m in range(1, 13) for d in range(1, 26)]
    n = len(dates)
    vals = [1.0] * n
    vals[100] = vals[101] = 99.0  # deux jours consecutifs
    vals[200] = 98.0              # episode isole plus tard
    ev = detect_daily_extremes(dates, vals, [True] * n, "heavy_rain", 99.0)
    assert len(ev) == 2
    first = next(e for e in ev if e.date_start == dates[100])
    assert first.metrics["duration_days"] == 2


def test_full_build_and_svg():
    annual, extras, events = synthetic_annual()
    tile = TileRequest("ODV-TEST", 44.06465, 3.68293)
    fp = build_fingerprint(tile, annual, extras)
    assert len(fp.rows) == 6
    assert all(len(r.years) == 30 for r in fp.rows)
    fp.events = events

    payload = fp.to_json()
    json.dumps(payload)  # doit etre serialisable
    assert payload["period"] == {"start": 1996, "end": 2025}
    assert payload["reference"] == {"start": 1991, "end": 2020}

    svg = render_svg(fp)
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")
    assert svg.count("<rect") >= 180  # 30 x 6 cellules minimum


def test_no_incomplete_year_in_matrix():
    annual, _, _ = synthetic_annual()
    tile = TileRequest("ODV-TEST", 44.0, 3.6)
    fp = build_fingerprint(tile, annual)
    for r in fp.rows:
        assert [c.year for c in r.years] == list(range(1996, 2026))
        assert 2026 not in [c.year for c in r.years]
