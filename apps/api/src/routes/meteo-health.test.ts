import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type pg from "pg";
import { registerMeteoHealthRoutes } from "./meteo-health.js";

test("expose le diagnostic météo sans mise en cache", async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("from couches.objets")) {
        return { rows: [{ station_count: 1500, updated_at: new Date() }] };
      }
      if (sql.includes("from series.meteo_horaire")) {
        return {
          rows: [{
            observed_station_count: 1200,
            fresh_station_count: 1100,
            fresh_observation_count: 1100,
            latest_observation_at: new Date(),
          }],
        };
      }
      return {
        rows: [
          {
            source: "meteo_stations",
            attempt_status: "ok",
            attempt_has_error: false,
            success_completed_at: new Date(),
          },
          {
            source: "meteo_obs_national",
            attempt_status: "ok",
            attempt_has_error: false,
            success_completed_at: new Date(),
          },
        ],
      };
    },
  } as unknown as pg.Pool;

  const app = Fastify();
  registerMeteoHealthRoutes(app, pool);

  const response = await app.inject({ method: "GET", url: "/api/v1/meteo/health" });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(payload.schemaVersion, "1");
  assert.equal(payload.status, "ok");
  assert.equal(payload.catalogue.stationCount, 1500);
  assert.equal(payload.observations.status, "fresh");

  await app.close();
});

test("retourne 503 sans exposer l'erreur PostgreSQL", async () => {
  const pool = {
    query: async () => {
      throw new Error("password=secret-test host=db-internal");
    },
  } as unknown as pg.Pool;

  const app = Fastify({ logger: false });
  registerMeteoHealthRoutes(app, pool);

  const response = await app.inject({ method: "GET", url: "/api/v1/meteo/health" });
  const payload = response.json();

  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(payload.status, "unavailable");
  assert.equal(payload.reason, "database_unavailable");
  assert.doesNotMatch(response.body, /secret-test|db-internal/);

  await app.close();
});
