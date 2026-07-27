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
  associationServiceUrl: "http://association-service:3000",
  associationServiceTimeoutMs: 100,
  version: "test",
};

test("relaie une recherche d'associations et propage le request-id", async (t) => {
  let calledUrl = "";
  let upstreamRequestId = "";
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calledUrl = String(input);
    upstreamRequestId = new Headers(init?.headers).get("x-request-id") ?? "";
    return new Response(JSON.stringify({
      total: 1,
      items: [{ rnaId: "W303000001", title: "Mémoire de l’Aigoual", administrativeStatus: "active" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/associations?code_insee=30339&q=m%C3%A9moire&status=active&category_primary=002000&category_secondary=002055&limit=25",
    headers: { "x-request-id": "association-test" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().total, 1);
  assert.equal(response.json().requestId, "association-test");
  assert.equal(upstreamRequestId, "association-test");
  assert.match(calledUrl, /^http:\/\/association-service:3000\/api\/v2\/associations\?/);
  assert.match(calledUrl, /category_primary=002000/);
  assert.match(calledUrl, /category_secondary=002055/);
  assert.match(calledUrl, /code_insee=30339/);
  assert.match(calledUrl, /q=m%C3%A9moire/);
  assert.match(calledUrl, /status=active/);
});

test("refuse les critères invalides sans appeler association-service", async (t) => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  for (const url of [
    "/api/v2/associations",
    "/api/v2/associations?code_insee=3033",
    "/api/v2/associations?code_insee=30339&status=inactive",
    "/api/v2/associations?code_insee=30339&limit=101",
  ]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 400, url);
  }
  assert.equal(calls, 0);
});

test("normalise l'indisponibilité d'association-service", async (t) => {
  const fetchImpl = (async () => {
    throw new Error("service indisponible");
  }) as typeof fetch;
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/associations?code_insee=30339",
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, "ASSOCIATION_SERVICE_UNAVAILABLE");
  assert.equal(response.json().error.retryable, true);
});
