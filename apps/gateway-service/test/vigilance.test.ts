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
  version: "test",
};
function fakeFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch { return implementation as typeof fetch; }

test("résout le département par geography puis appelle vigilance", async (t) => {
  const calls: string[] = [];
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async (input) => {
    const url = String(input); calls.push(url);
    if (url.includes("geography-service")) return new Response(JSON.stringify({ territory: { status: "available", data: { department: { code: "30", name: "Gard" } } } }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("weather-vigilance-service")) return new Response(JSON.stringify({ service: "weather-vigilance", location: { department_code: "30" }, periods: [], bulletins: [] }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(null, { status: 200 });
  }) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/vigilance?lat=44.0812&lon=3.6421&accuracy=25" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().location.department_name, "Gard");
  assert.equal(response.json().location.input.accuracy_m, 25);
  assert.match(calls[0]!, /horizontalAccuracyMeters=25/);
  assert.match(calls[1]!, /departments\/30\?include_bulletins=false/);
});

test("permet un appel déterministe par département", async (t) => {
  const calls: string[] = [];
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async (input) => { calls.push(String(input)); return String(input).includes("legacy-api") ? new Response(null, { status: 200 }) : new Response(JSON.stringify({ location: { department_code: "30" }, periods: [] }), { status: 200, headers: { "content-type": "application/json" } }); }) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/vigilance?department_code=30&include_bulletins=true" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().location.resolved_by, "request");
  assert.equal(calls.filter((url) => url.includes("geography-service")).length, 0);
  assert.match(calls.find((url) => url.includes("weather-vigilance-service"))!, /include_bulletins=true/);
});

test("refuse des coordonnées et un département incohérents", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async (input) => String(input).includes("geography-service") ? new Response(JSON.stringify({ territory: { data: { department: { code: "30", name: "Gard" } } } }), { status: 200, headers: { "content-type": "application/json" } }) : new Response(null, { status: 200 })) }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/vigilance?lat=44&lon=3&department_code=75" });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, "INCONSISTENT_DEPARTMENT");
});
