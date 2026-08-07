import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

const config: GatewayConfig = {
  host: "127.0.0.1", port: 3000,
  legacyApiUrl: "http://legacy-api:3000", upstreamTimeoutMs: 100,
  geographyServiceUrl: "http://geography-service:3000", geographyServiceTimeoutMs: 100,
  weatherServiceUrl: "http://weather-service:3000", weatherServiceTimeoutMs: 100,
  geologieServiceUrl: "http://geologie-service:3000", geologieServiceTimeoutMs: 100,
  geologieSyntheseTimeoutMs: 100,
  version: "test",
};

function fakeFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return implementation as typeof fetch;
}

test("relaie reference vers le service géologie interne et retourne le corps tel quel", async (t) => {
  const calls: string[] = [];
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ reference: "09372X0012/MONNA", methode_synthese: "structure_seule" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/geologie/bss/synthese?reference=09372X0012%2FMONNA",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().methode_synthese, "structure_seule");
  assert.match(calls[0]!, /^http:\/\/geologie-service:3000\/internal\/v1\/geologie\/bss\/synthese\?/);
  assert.match(calls[0]!, /reference=09372X0012%2FMONNA/);
});

test("refuse une requête sans reference, sans appeler l'amont", async (t) => {
  let called = false;
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => { called = true; return new Response(null); }),
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/geologie/bss/synthese" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_QUERY");
  assert.equal(called, false);
});

test("renvoie 504 avec un code dédié si le service géologie n'a pas répondu à temps", async (t) => {
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => {
      const err = new Error("expiré");
      err.name = "TimeoutError";
      throw err;
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/geologie/bss/synthese?reference=09372X0012/MONNA",
  });
  assert.equal(response.statusCode, 504);
  assert.equal(response.json().error.code, "GEOLOGIE_SERVICE_TIMEOUT");
});

test("propage un code d'erreur amont (ex. 502 InfoTerre indisponible) tel quel", async (t) => {
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () =>
      new Response(
        JSON.stringify({ error: { code: "GEOLOGIE_INFOTERRE_UNAVAILABLE", message: "indisponible", retryable: true } }),
        { status: 502, headers: { "content-type": "application/json" } },
      )),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/v2/geologie/bss/synthese?reference=09372X0012/MONNA",
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, "GEOLOGIE_INFOTERRE_UNAVAILABLE");
});
