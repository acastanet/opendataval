import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

const config: GatewayConfig = {
  host: "127.0.0.1",
  port: 3000,
  legacyApiUrl: "http://legacy-api:3000",
  upstreamTimeoutMs: 100,
  geographyServiceUrl: "http://geography-service:3000",
  geographyServiceTimeoutMs: 100,
  weatherServiceUrl: "http://weather-service:3000",
  weatherServiceTimeoutMs: 100,
  vigilanceServiceUrl: "http://weather-vigilance-service:3000",
  vigilanceServiceTimeoutMs: 100,
  fireDetectionServiceUrl: "http://fire-detection-service:3000",
  fireDetectionServiceTimeoutMs: 100,
  version: "test",
};

function statusById(services: Array<{ id: string; status: string }>): Record<string, string> {
  return Object.fromEntries(services.map((service) => [service.id, service.status]));
}

test("GET /api/v2/status agrège l'état des microservices", async (t) => {
  // geography, weather et legacy répondent ; vigilance et fire échouent.
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("weather-vigilance-service") || url.includes("fire-detection-service")) {
      throw new Error("service indisponible");
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/status" });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  const status = statusById(body.services);
  assert.equal(status.gateway, "ok");
  assert.equal(status.geography, "ok");
  assert.equal(status.weather, "ok");
  assert.equal(status.legacy, "ok");
  assert.equal(status.vigilance, "unavailable");
  assert.equal(status.fire, "unavailable");
  assert.equal(typeof body.services[0].latencyMs, "number");
});

test("GET /api/v2/status reste 200 même si tout échoue, gateway toujours ok", async (t) => {
  const fetchImpl = (async () => {
    throw new Error("tout est cassé");
  }) as typeof fetch;

  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/status" });

  assert.equal(response.statusCode, 200);
  const status = statusById(response.json().services);
  assert.equal(status.gateway, "ok");
  assert.equal(status.geography, "unavailable");
  assert.equal(status.legacy, "unavailable");
});
