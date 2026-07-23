import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

const config: GatewayConfig = {
  host: "127.0.0.1", port: 3000, legacyApiUrl: "http://legacy-api:3000", upstreamTimeoutMs: 100,
  geographyServiceUrl: "http://geography-service:3000", geographyServiceTimeoutMs: 100,
  weatherServiceUrl: "http://weather-service:3000", weatherServiceTimeoutMs: 100,
  vigilanceServiceUrl: "http://weather-vigilance-service:3000", vigilanceServiceTimeoutMs: 100,
  version: "test",
};

function fakeFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch { return implementation as typeof fetch; }
const vigilance = { service: "weather-vigilance", location: { department_code: "30", department_name: "Gard" }, periods: [], source: {}, cache: {}, warnings: [] };

test("résout le département avant d'appeler la vigilance", async (t) => {
  const calls: string[] = [];
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async (input) => {
    const url = String(input); calls.push(url);
    if (url.includes("geography")) return new Response(JSON.stringify({ query: { latitude: 44.081, longitude: 3.641, horizontalAccuracyMeters: 25 }, territory: { status: "available", data: { department: { code: "30", name: "Gard" } } } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(vigilance), { status: 200, headers: { "content-type": "application/json" } });
  }) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/vigilance?lat=44.081&lon=3.641&accuracy=25" });
  assert.equal(response.statusCode, 200);
  assert.equal(calls[0], "http://geography-service:3000/internal/v1/geography/resolve?lat=44.081&lon=3.641&horizontalAccuracyMeters=25&positionSource=manual");
  assert.equal(calls[1], "http://weather-vigilance-service:3000/v1/vigilance/departments/30");
  assert.equal(response.json().location.resolved_by, "location-service");
  assert.equal(response.json().location.input.accuracy_m, 25);
});

test("accepte un appel déterministe par département", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async (input) => {
    assert.equal(String(input), "http://weather-vigilance-service:3000/v1/vigilance/departments/2A?include_bulletins=true");
    return new Response(JSON.stringify(vigilance), { status: 200, headers: { "content-type": "application/json" } });
  }) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/vigilance?department_code=2A&include_bulletins=true" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().location.resolved_by, "department-code");
});

test("refuse des coordonnées et un département incohérents", async (t) => {
  let vigilanceCalled = false;
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async (input) => {
    if (String(input).includes("weather-vigilance")) vigilanceCalled = true;
    return new Response(JSON.stringify({ query: { latitude: 44, longitude: 3 }, territory: { status: "available", data: { department: { code: "30", name: "Gard" } } } }), { status: 200, headers: { "content-type": "application/json" } });
  }) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/vigilance?department_code=13&lat=44&lon=3" });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, "DEPARTMENT_COORDINATES_MISMATCH");
  assert.equal(vigilanceCalled, false);
});
