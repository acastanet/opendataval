"""Construction de l'empreinte à partir d'une table annuelle (spec §18 étapes 3-4)."""
from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

from .model import (MVP_ROWS, VOCABULARY, Fingerprint, Row, TileRequest, YearCell)
from .stats import (classify, decade_delta, mann_kendall, percentile_of, ranks,
                    reference_stats, theil_sen)

#: Table annuelle = {row_id: {year: value}} + éventuels extras {row_id: {year: {...}}}
AnnualTable = Mapping[str, Mapping[int, float | None]]


def build_fingerprint(
    tile: TileRequest,
    annual: AnnualTable,
    extras: Mapping[str, Mapping[int, dict[str, Any]]] | None = None,
    rows_def: Sequence[dict[str, Any]] = tuple(MVP_ROWS),
    provenance: dict[str, Any] | None = None,
) -> Fingerprint:
    extras = extras or {}
    p0, p1 = tile.period
    r0, r1 = tile.reference_period
    years = list(range(p0, p1 + 1))
    fp = Fingerprint(tile=tile, provenance=provenance or {})

    for spec in rows_def:
        rid = spec["id"]
        series = annual.get(rid, {})
        if not series:
            continue
        row = Row(**{k: v for k, v in spec.items()})

        ref_values = [series.get(y) for y in range(r0, r1 + 1)]
        ref_values = [v for v in ref_values if v is not None and not math.isnan(v)]
        ref = reference_stats(ref_values)
        row.reference = ref

        values = [series.get(y) for y in years]
        rk = ranks(values, descending=row.higher_is_intense)

        for i, y in enumerate(years):
            v = values[i]
            pct = percentile_of(v, ref_values) if (v is not None and ref_values) else float("nan")
            cls = classify(pct)
            cell = YearCell(
                year=y,
                value=None if v is None else float(v),
                anomaly=None if (v is None or "mean" not in ref) else float(v - ref["mean"]),
                percentile=None if math.isnan(pct) else round(pct, 1),
                cls=cls,
                rank=rk[i],
                extra=dict(extras.get(rid, {}).get(y, {})),
            )
            if cls:
                cell.extra["class_label"] = VOCABULARY.get(row.palette, {}).get(cls, cls)
            row.years.append(cell)

        clean = [v for v in values if v is not None and not math.isnan(v)]
        if len(clean) >= 8:
            ys = [y for y, v in zip(years, values) if v is not None and not math.isnan(v)]
            row.trend = {**theil_sen(ys, clean), **mann_kendall(clean)}
        row.decade_delta = decade_delta(years, values, (p0, p0 + 9), (p1 - 9, p1))
        fp.rows.append(row)

    return fp
