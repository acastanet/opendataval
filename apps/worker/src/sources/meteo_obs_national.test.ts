import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import {
  latestPublishedHour,
  parseHourlyObservationPacket,
  run,
} from "./meteo_obs_national.js";

const packet = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [5.669, 46.278167] },
      properties: {
        geo_id_insee: 1014002,
        validity_time: "2026-07-23T03:00:00Z",
        t: 284.85,
        u: 79,
        dd: 170,
        ff: 2,
        fxi10: 4.8,
        rr_per: 0.2,
        pmer: 101325,
        sss: 0.02,
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [5.216, 43.4377] },
      properties: {
        geo_id_insee: "13054001",
        validity_time: "2026-07-23T03:00:00Z",
        t: 298.15,
        u: "50",
        dd: "220",
        ff: "5",
        raf10: "8",
        rr1: "0",
        pres: "100800",
        sss: null,
      },
    },
    {
      type: "Feature",
      geometry: null,
      properties: {
        geo_id_insee: "13054001",
        validity_time: "2026-07-23T03:00:00Z",
        t: 299.15,
      },
    },
    { type: "Feature", properties: { geo_id_insee: "invalide" } },
  ],
};

test("normalise le paquet GeoJSON national et les champs de rafale v1/v2", () => {
  const parsed = parseHourlyObservationPacket(packet);

  assert.equal(parsed.observations.length, 2);
  assert.equal(parsed.rejectedRows, 1);
  assert.equal(parsed.duplicateRows, 1);
  assert.deepEqual(parsed.observations[0], {
    numPoste: "01014002",
    heureUtc: "2026-07-23T03:00:00.000Z",
    t: 11.7,
    humidite: 79,
    ventDir: 170,
    ventKmh: 7.2,
    rafaleKmh: 17.3,
    pluie1hMm: 0.2,
    pressionHpa: 1013.3,
    neigeCm: 2,
  });
  assert.deepEqual(parsed.observations[1], {
    numPoste: "13054001",
    heureUtc: "2026-07-23T03:00:00.000Z",
    t: 26,
    humidite: null,
    ventDir: null,
    ventKmh: null,
    rafaleKmh: null,
    pluie1hMm: null,
    pressionHpa: null,
    neigeCm: null,
  });
});

test("choisit l'heure courante après publication et l'heure précédente avant H+15", () => {
  assert.equal(
    latestPublishedHour(new Date("2026-07-23T03:20:42Z")).toISOString(),
    "2026-07-23T03:00:00.000Z",
  );
  assert.equal(
    latestPublishedHour(new Date("2026-07-23T03:08:42Z")).toISOString(),
    "2026-07-23T02:00:00.000Z",
  );
});

test("télécharge et insère le paquet national en une requête SQL", { concurrency: false }, async () => {
  const queries: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      return { rows: [], rowCount: 2 };
    },
  } as unknown as pg.Pool;

  const initialFetch = globalThis.fetch;
  const initialToken = process.env.METEOFRANCE_API_TOKEN;
  const initialUrl = process.env.METEOFRANCE_HOURLY_PACKET_URL;
  const initialMinimum = process.env.METEOFRANCE_MIN_HOURLY_OBSERVATIONS;
  process.env.METEOFRANCE_API_TOKEN = "token-test";
  process.env.METEOFRANCE_HOURLY_PACKET_URL = "https://example.test/paquet/stations/horaire";
  process.env.METEOFRANCE_MIN_HOURLY_OBSERVATIONS = "2";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://example.test/paquet/stations/horaire");
    assert.equal(url.searchParams.get("date"), "2026-07-23T03:00:00.000Z");
    assert.equal(url.searchParams.get("format"), "geojson");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer token-test");
    assert.equal(headers.apikey, "token-test");
    return Response.json(packet);
  };

  try {
    const result = await run(pool, new Date("2026-07-23T03:20:42Z"));
    assert.deepEqual(result, {
      nbLignes: 2,
      statut: "partiel",
      avertissement: "1 lignes rejetées ; 1 doublons remplacés",
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0]?.sql ?? "", /insert into series\.meteo_horaire/);
    assert.match(queries[0]?.sql ?? "", /from unnest/);
    assert.deepEqual(queries[0]?.values?.[0], ["01014002", "13054001"]);
    assert.deepEqual(queries[0]?.values?.[1], [
      "2026-07-23T03:00:00.000Z",
      "2026-07-23T03:00:00.000Z",
    ]);
  } finally {
    globalThis.fetch = initialFetch;
    if (initialToken === undefined) delete process.env.METEOFRANCE_API_TOKEN;
    else process.env.METEOFRANCE_API_TOKEN = initialToken;
    if (initialUrl === undefined) delete process.env.METEOFRANCE_HOURLY_PACKET_URL;
    else process.env.METEOFRANCE_HOURLY_PACKET_URL = initialUrl;
    if (initialMinimum === undefined) delete process.env.METEOFRANCE_MIN_HOURLY_OBSERVATIONS;
    else process.env.METEOFRANCE_MIN_HOURLY_OBSERVATIONS = initialMinimum;
  }
});
