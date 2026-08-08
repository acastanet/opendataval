import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";
import { CAS_APERCU, manifesteApercu } from "../src/pages/dalle/fixtures.js";

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

test("l'index liste tous les cas et chaque aperçu rend une page HTML", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());

  const index = await app.inject({ method: "GET", url: "/api/v2/sites/apercu" });
  assert.equal(index.statusCode, 200);
  for (const cas of CAS_APERCU) {
    assert.ok(index.body.includes(`/api/v2/sites/apercu/${cas.id}`));
    const response = await app.inject({ method: "GET", url: `/api/v2/sites/apercu/${cas.id}` });
    assert.equal(response.statusCode, 200, cas.id);
    assert.match(String(response.headers["content-type"]), /text\/html/);
    assert.ok(response.body.includes("Aperçu fictif"));
  }
});

test("un aperçu inconnu renvoie 404", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/sites/apercu/inconnu" });
  assert.equal(response.statusCode, 404);
});

test("la route d'aperçu n'éclipse pas une dalle réelle", async (t) => {
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: (async () => new Response(JSON.stringify(manifesteApercu()), { status: 200 })) as typeof fetch,
  });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });
  assert.equal(response.statusCode, 200);
  assert.ok(!response.body.includes("Aperçu fictif"));
});
