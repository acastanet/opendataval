import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const response = {
  service: "fire-detection" as const,
  version: "test",
  data_status: "available" as const,
  location: { latitude: 44, longitude: 3, radius_km: 50 },
  realtime: { window_minutes: 90, suspicions: [] },
  last_detection_50km: null,
  sources: [],
  warnings: [],
  generated_at: "2026-07-24T21:00:00Z",
};

test("valide la position et appelle le service", async () => {
  let input: unknown;
  const app = buildApp({
    config: loadConfig({ NASA_FIRMS_MAP_KEY: "test" }),
    logger: false,
    service: { nearby: async (value) => { input = value; return response; } },
  });
  const result = await app.inject({ method: "GET", url: "/v1/fire/nearby?lat=44&lon=3&accuracy=20&radius_km=50&history_days=7" });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(input, { latitude: 44, longitude: 3, accuracyM: 20, radiusKm: 50, historyDays: 7 });
  await app.close();
});

test("refuse un historique supérieur à sept jours", async () => {
  const app = buildApp({ config: loadConfig({ NASA_FIRMS_MAP_KEY: "test" }), logger: false, service: { nearby: async () => response } });
  const result = await app.inject({ method: "GET", url: "/v1/fire/nearby?lat=44&lon=3&history_days=8" });
  assert.equal(result.statusCode, 400);
  await app.close();
});
