import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

const config: GatewayConfig = {
  host: "127.0.0.1",
  port: 3000,
  legacyApiUrl: "http://legacy-api:3000",
  upstreamTimeoutMs: 100,
  version: "test",
};

function fakeFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

test("GET /health expose l'identité du gateway et le request-id", async (t) => {
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => new Response(null, { status: 200 })),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/health",
    headers: { "x-request-id": "req-health" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-request-id"], "req-health");
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "gateway-service",
    version: "test",
  });
});

test("GET /ready vérifie l'API historique", async (t) => {
  const fetchImpl = fakeFetch(async (input) => {
    assert.equal(String(input), "http://legacy-api:3000/api/health");
    return new Response('{"status":"ok"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "ready");
  assert.equal(response.json().dependencies.legacyApi, "ok");
});

test("GET /ready renvoie 503 lorsque l'API historique est indisponible", async (t) => {
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => {
      throw new Error("connexion refusée");
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().status, "not_ready");
  assert.equal(response.json().dependencies.legacyApi, "unavailable");
});

test("le proxy traduit /api/v2/legacy vers /api et propage le request-id", async (t) => {
  const fetchImpl = fakeFetch(async (input, init) => {
    assert.equal(
      String(input),
      "http://legacy-api:3000/api/meteo/v1/essential?lat=44.08&lon=3.64",
    );
    assert.equal(init?.method, "GET");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-request-id"), "req-proxy");
    return new Response('{"source":"legacy"}', {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-upstream": "legacy-api",
      },
    });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/legacy/meteo/v1/essential?lat=44.08&lon=3.64",
    headers: { "x-request-id": "req-proxy" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-request-id"], "req-proxy");
  assert.equal(response.headers["x-upstream"], "legacy-api");
  assert.deepEqual(response.json(), { source: "legacy" });
});

test("le proxy normalise un timeout amont", async (t) => {
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => {
      throw new DOMException("délai dépassé", "TimeoutError");
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/legacy/meteo/v1/essential",
  });

  assert.equal(response.statusCode, 504);
  assert.equal(response.json().error.code, "UPSTREAM_TIMEOUT");
  assert.equal(response.json().error.retryable, true);
});
