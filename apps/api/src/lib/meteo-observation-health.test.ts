import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import {
  loadMeteoObservationHealth,
  METEO_HEALTH_JOBS,
} from "./meteo-observation-health.js";

const now = new Date("2026-07-23T10:00:00.000Z");

function healthyPool(): pg.Pool {
  return {
    query: async (sql: string, values?: unknown[]) => {
      if (sql.includes("from couches.objets")) {
        return {
          rows: [{
            station_count: "2140",
            updated_at: "2026-07-23T02:15:00.000Z",
          }],
        };
      }
      if (sql.includes("from series.meteo_horaire")) {
        assert.deepEqual(values, ["2026-07-23T08:30:00.000Z"]);
        return {
          rows: [{
            observed_station_count: "1800",
            fresh_station_count: "1750",
            fresh_observation_count: "1750",
            latest_observation_at: "2026-07-23T09:00:00.000Z",
          }],
        };
      }
      if (sql.includes("from unnest($1::text[])")) {
        assert.deepEqual(values, [[...METEO_HEALTH_JOBS]]);
        return {
          rows: METEO_HEALTH_JOBS.map((source) => ({
            source,
            attempt_started_at: "2026-07-23T09:18:00.000Z",
            attempt_completed_at: "2026-07-23T09:18:10.000Z",
            attempt_status: "ok",
            attempt_rows: source === "meteo_obs_national" ? "1750" : "2140",
            attempt_has_error: false,
            success_completed_at: "2026-07-23T09:18:10.000Z",
            success_rows: source === "meteo_obs_national" ? "1750" : "2140",
          })),
        };
      }
      throw new Error(`Requête SQL inattendue : ${sql}`);
    },
  } as unknown as pg.Pool;
}

test("retourne un état sain lorsque le catalogue, les observations et les jobs sont à jour", async () => {
  const health = await loadMeteoObservationHealth(healthyPool(), now);

  assert.equal(health.schemaVersion, "1");
  assert.equal(health.status, "ok");
  assert.deepEqual(health.degradedReasons, []);
  assert.deepEqual(health.catalogue, {
    stationCount: 2140,
    minimumExpectedStations: 1000,
    updatedAt: "2026-07-23T02:15:00.000Z",
    status: "ready",
  });
  assert.deepEqual(health.observations, {
    observedStationCount: 1800,
    freshStationCount: 1750,
    freshObservationCount: 1750,
    latestObservationAt: "2026-07-23T09:00:00.000Z",
    latestObservationAgeMinutes: 60,
    maximumAgeMinutes: 90,
    status: "fresh",
  });
  assert.equal(health.ingestion.length, 5);
  assert.equal(health.ingestion[0]?.critical, true);
  assert.equal(health.ingestion[1]?.critical, true);
  assert.equal(health.ingestion[2]?.critical, false);
  assert.equal(health.generatedAt, now.toISOString());
});

test("dégrade explicitement un catalogue incomplet, des observations périmées et un job critique en erreur", async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("from couches.objets")) {
        return { rows: [{ station_count: 21, updated_at: "2026-07-20T02:15:00Z" }] };
      }
      if (sql.includes("from series.meteo_horaire")) {
        return {
          rows: [{
            observed_station_count: 21,
            fresh_station_count: 0,
            fresh_observation_count: 0,
            latest_observation_at: "2026-07-23T06:00:00Z",
          }],
        };
      }
      return {
        rows: [
          {
            source: "meteo_stations",
            attempt_started_at: "2026-07-23T02:15:00Z",
            attempt_completed_at: "2026-07-23T02:15:04Z",
            attempt_status: "erreur",
            attempt_rows: null,
            attempt_has_error: true,
            success_completed_at: null,
            success_rows: null,
          },
          {
            source: "meteo_obs_national",
            attempt_started_at: "2026-07-23T09:18:00Z",
            attempt_completed_at: "2026-07-23T09:18:05Z",
            attempt_status: "partiel",
            attempt_rows: 21,
            attempt_has_error: false,
            success_completed_at: "2026-07-23T09:18:05Z",
            success_rows: 21,
          },
        ],
      };
    },
  } as unknown as pg.Pool;

  const health = await loadMeteoObservationHealth(pool, now);

  assert.equal(health.status, "degraded");
  assert.deepEqual(health.degradedReasons, [
    "catalogue_incomplete",
    "observations_stale",
    "critical_ingestion_error",
    "critical_ingestion_never_succeeded",
  ]);
  assert.equal(health.catalogue.status, "incomplete");
  assert.equal(health.observations.status, "stale");
  assert.equal(health.observations.latestObservationAgeMinutes, 240);
  assert.equal(health.ingestion[0]?.lastAttemptStatus, "erreur");
  assert.equal(health.ingestion[0]?.lastAttemptHadError, true);
  assert.equal(health.ingestion[0]?.lastSuccessAt, null);
  assert.equal(health.ingestion[1]?.lastAttemptStatus, "partiel");
  assert.equal(health.ingestion[1]?.lastSuccessRows, 21);
});

test("distingue l'absence complète de catalogue et d'observations", async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("from unnest($1::text[])")) return { rows: [] };
      return { rows: [{}] };
    },
  } as unknown as pg.Pool;

  const health = await loadMeteoObservationHealth(pool, now);

  assert.equal(health.status, "degraded");
  assert.deepEqual(health.degradedReasons, [
    "catalogue_empty",
    "observations_empty",
    "critical_ingestion_never_succeeded",
  ]);
  assert.equal(health.catalogue.status, "empty");
  assert.equal(health.observations.status, "empty");
  assert.equal(health.observations.latestObservationAgeMinutes, null);
});
