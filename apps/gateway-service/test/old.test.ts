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
  oldServiceUrl: "http://old-service:3000",
  oldServiceTimeoutMs: 100,
  version: "test",
};

test("relaie le calcul du périmètre OLD et le request-id", async (t) => {
  let calledUrl = "";
  let calledRequestId = "";
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calledUrl = String(input);
    calledRequestId = new Headers(init?.headers).get("x-request-id") ?? "";
    return Response.json({ status: "indicatif", applicable: true, geojson: {} });
  }) as typeof fetch;
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/old/perimetre?lon=3.68302778&lat=44.06455556&distance_m=50",
    headers: { "x-request-id": "req-old" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-request-id"], "req-old");
  assert.equal(calledRequestId, "req-old");
  assert.equal(
    calledUrl,
    "http://old-service:3000/internal/v1/old/perimetre?lat=44.06455556&lon=3.68302778&distance_m=50",
  );
  assert.equal(response.json().applicable, true);
});

test("normalise l’indisponibilité du service OLD", async (t) => {
  const fetchImpl = (async () => { throw new Error("connexion refusée"); }) as typeof fetch;
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/old/perimetre?lon=3.68&lat=44.06",
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, "OLD_SERVICE_UNAVAILABLE");
});

test("refuse les paramètres syntaxiquement invalides avant l’appel amont", async (t) => {
  const fetchImpl = (async () => { throw new Error("ne doit pas être appelé"); }) as typeof fetch;
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: `/api/v2/old/perimetre?lon=${"1".repeat(41)}&lat=44.06`,
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_QUERY");
});
