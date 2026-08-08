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
  siteServiceUrl: "http://site-service:3000",
  siteServiceTimeoutMs: 100,
  version: "test",
};

function fakeFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

test("POST /api/v2/sites relaie la création vers site-service et propage le request-id", async (t) => {
  const fetchImpl = fakeFetch(async (input, init) => {
    assert.equal(String(input), "http://site-service:3000/internal/v1/sites");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("x-request-id"), "req-create");
    assert.deepEqual(JSON.parse(String(init?.body)), { lat: 44.064555, lon: 3.683027, title: "Maison" });
    return new Response(JSON.stringify({ identity: { tileId: "ODV-2026-000001" }, status: "created" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/v2/sites",
    headers: { "x-request-id": "req-create" },
    payload: { lat: 44.064555, lon: 3.683027, title: "Maison" },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["x-request-id"], "req-create");
  assert.equal(response.json().identity.tileId, "ODV-2026-000001");
});

test("POST /api/v2/sites propage tel quel un refus de site-service (ex. coordonnées invalides)", async (t) => {
  const fetchImpl = fakeFetch(async () =>
    new Response(JSON.stringify({ error: { code: "INVALID_COORDINATES", message: "latitude invalide : 200" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  );
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/v2/sites", payload: { lat: 200, lon: 3 } });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_COORDINATES");
});

test("POST /api/v2/sites/:tileId/build relaie le déclenchement de fabrication", async (t) => {
  const fetchImpl = fakeFetch(async (input, init) => {
    assert.equal(String(input), "http://site-service:3000/internal/v1/sites/ODV-2026-000001/build");
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ status: "generated" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/v2/sites/ODV-2026-000001/build" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "generated");
});

test("POST /api/v2/sites/:tileId/review relaie l'action et le corps de décision", async (t) => {
  const fetchImpl = fakeFetch(async (input, init) => {
    assert.equal(String(input), "http://site-service:3000/internal/v1/sites/ODV-2026-000001/review");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { action: "approve", reviewedBy: "alex", notes: "conforme" });
    return new Response(JSON.stringify({ status: "approved" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/v2/sites/ODV-2026-000001/review",
    payload: { action: "approve", reviewedBy: "alex", notes: "conforme" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "approved");
});

test("POST /api/v2/sites/:tileId/review propage un refus de site-service (ex. reviewedBy manquant)", async (t) => {
  const fetchImpl = fakeFetch(async () =>
    new Response(JSON.stringify({ error: { code: "INVALID_BODY", message: "reviewedBy est obligatoire" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  );
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/v2/sites/ODV-2026-000001/review", payload: { action: "approve" } });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_BODY");
});

test("POST /api/v2/sites/:tileId/publish relaie la publication", async (t) => {
  const fetchImpl = fakeFetch(async (input, init) => {
    assert.equal(String(input), "http://site-service:3000/internal/v1/sites/ODV-2026-000001/publish");
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ status: "published" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/v2/sites/ODV-2026-000001/publish" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "published");
});

test("POST /api/v2/sites/:tileId/publish propage un refus de transition (409)", async (t) => {
  const fetchImpl = fakeFetch(async () =>
    new Response(JSON.stringify({ error: { code: "SITE_INVALID_TRANSITION", message: "transition refusée" } }), {
      status: 409,
      headers: { "content-type": "application/json" },
    }),
  );
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/v2/sites/ODV-2026-000001/publish" });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "SITE_INVALID_TRANSITION");
});

test("normalise un timeout amont sur la création", async (t) => {
  const fetchImpl = fakeFetch(async () => {
    throw new DOMException("délai dépassé", "TimeoutError");
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/v2/sites", payload: { lat: 44, lon: 3 } });

  assert.equal(response.statusCode, 504);
  assert.equal(response.json().error.code, "SITE_SERVICE_TIMEOUT");
});

test("normalise l'indisponibilité de site-service sur le déclenchement de fabrication", async (t) => {
  const fetchImpl = fakeFetch(async () => {
    throw new Error("ECONNREFUSED");
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/v2/sites/ODV-2026-000001/build" });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, "SITE_SERVICE_UNAVAILABLE");
});
