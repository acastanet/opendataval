import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import { run } from "./firms.js";

const csv = [
  "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight",
  "44.10000,3.60000,2026-07-18,0600,NPP,VIIRS,n,4.2,D",
].join("\n");

test("l'insertion FIRMS exige l'appartenance au polygone exact du Gard", { concurrency: false }, async () => {
  const requetes: string[] = [];
  const pool = {
    query: async (sql: string) => {
      requetes.push(sql);
      if (sql.includes("ST_XMin")) return { rows: [{ west: 3, south: 43, east: 4, north: 45 }] };
      return { rowCount: 1, rows: [] };
    },
  } as unknown as pg.Pool;
  const fetchInitial = globalThis.fetch;
  const cleInitiale = process.env.NASA_FIRMS_MAP_KEY;
  process.env.NASA_FIRMS_MAP_KEY = "cle-de-test";
  globalThis.fetch = async () => new Response(csv, { status: 200 });
  try {
    const resultat = await run(pool);
    assert.equal(resultat, 3);
    const insertions = requetes.filter((requete) => requete.includes("insert into incendies.detections_firms"));
    assert.equal(insertions.length, 3);
    for (const insertion of insertions) {
      assert.match(insertion, /veille as \(/);
      assert.match(insertion, /where ST_Covers\(departement\.geom, point\.geom\)/);
    }
  } finally {
    globalThis.fetch = fetchInitial;
    if (cleInitiale === undefined) delete process.env.NASA_FIRMS_MAP_KEY;
    else process.env.NASA_FIRMS_MAP_KEY = cleInitiale;
  }
});
