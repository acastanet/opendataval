import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type pg from "pg";
import type { ResolvedGeography } from "../lib/geography.js";
import { registerMeteoV1RoutesWithProvenance } from "./meteo-v1-with-provenance.js";

const now = new Date("2026-07-22T14:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1_000);

const paris: ResolvedGeography = {
  coordinates: { latitude: 48.8566, longitude: 2.3522 },
  label: "Paris",
  municipality: { name: "Paris", inseeCode: "75056" },
  department: { name: "Paris", code: "75" },
  altitudeM: 35,
  resolution: { administrative: "ign", altitude: "ign" },
  unavailableSources: [],
  generatedAt: now.toISOString(),
};

const weatherData = {
  current: {
    time: nowSeconds,
    temperature_2m: 25.3,
    apparent_temperature: 25.8,
    weather_code: 1,
  },
  hourly: {
    time: [nowSeconds, nowSeconds + 3_600],
    temperature_2m: [25.3, 25.8],
    precipitation_probability: [0, 10],
    wind_gusts_10m: [10, 12],
    weather_code: [1, 1],
  },
  daily: {
    time: [nowSeconds],
    temperature_2m_max: [27],
    temperature_2m_min: [18],
  },
};

function vigilance() {
  return {
    niveau: "green" as const,
    phenomenes: [],
    miseAJour: now,
    indisponible: false,
  };
}

test("le parcours public charge les candidates proches depuis PostGIS", async () => {
  const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("from couches.objets")) {
        return {
          rows: [{
            external_id: "07156",
            props: {
              nom: "Paris-Montsouris",
              altitude_m: 75,
              reseau: "meteofrance",
              pack: "RADOME",
              licence: "Licence Ouverte 2.0",
            },
            latitude: 48.8217,
            longitude: 2.3378,
          }],
        };
      }
      if (sql.includes("from series.meteo_horaire")) {
        return {
          rows: [{
            num_poste: "07156",
            t: 24.7,
            heure_utc: "2026-07-22T13:50:00.000Z",
          }],
        };
      }
      return { rows: [] };
    },
  } as unknown as pg.Pool;

  const app = Fastify();
  registerMeteoV1RoutesWithProvenance(app, pool, {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => vigilance(),
    now: () => now,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(payload.current.nature, "observation");
  assert.equal(payload.current.station.id, "07156");
  assert.equal(payload.current.station.name, "Paris-Montsouris");
  assert.equal(payload.provenance.stationSelection.selectedStationId, "07156");
  assert.deepEqual(calls[0]?.values, [2.3522, 48.8566, 50_000]);
  assert.ok(calls[1]?.values?.[0] instanceof Array);
  assert.deepEqual(calls[1]?.values?.[0], ["07156"]);

  await app.close();
});

test("Paris ne reçoit plus les stations du repli cévenol lorsque le catalogue est vide", async () => {
  const calls: string[] = [];
  const pool = {
    query: async (sql: string) => {
      calls.push(sql);
      return { rows: [] };
    },
  } as unknown as pg.Pool;

  const app = Fastify();
  registerMeteoV1RoutesWithProvenance(app, pool, {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => vigilance(),
    now: () => now,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(payload.current.nature, "model");
  assert.equal(payload.current.station, null);
  assert.equal(payload.provenance.stationSelection.receivedMeasurements, 0);
  assert.equal(payload.provenance.stationSelection.nearestCandidate, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? "", /from couches\.objets/);

  await app.close();
});
