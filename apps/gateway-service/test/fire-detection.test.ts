import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

const config: GatewayConfig = {
  host: "127.0.0.1", port: 3000,
  legacyApiUrl: "http://legacy-api:3000", upstreamTimeoutMs: 100,
  geographyServiceUrl: "http://geography-service:3000", geographyServiceTimeoutMs: 100,
  weatherServiceUrl: "http://weather-service:3000", weatherServiceTimeoutMs: 100,
  vigilanceServiceUrl: "http://weather-vigilance-service:3000", vigilanceServiceTimeoutMs: 100,
  fireDetectionServiceUrl: "http://fire-detection-service:3000", fireDetectionServiceTimeoutMs: 100,
  version: "test",
};
function fakeFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch { return implementation as typeof fetch; }

test("force le rayon de 50 km et les sept derniers jours", async (t) => {
  const calls: string[] = [];
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ service: "fire-detection", data_status: "available", realtime: { suspicions: [] }, last_detection_50km: null }), { status: 200, headers: { "content-type": "application/json" } });
  }) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/fire/nearby?lat=44.0812&lon=3.6421&accuracy=25" });
  assert.equal(response.statusCode, 200);
  assert.match(calls[0]!, /radius_km=50/);
  assert.match(calls[0]!, /history_days=7/);
  assert.match(calls[0]!, /accuracy=25/);
});

test("refuse les coordonnées invalides sans appeler l'amont", async (t) => {
  let called = false;
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async () => { called = true; return new Response(null); }) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/fire/nearby?lat=999&lon=3" });
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});
