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

test("sert les actifs du viewer avec leur type MIME", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());

  const css = await app.inject({ method: "GET", url: "/api/v2/sites/viewer/styles.css" });
  assert.equal(css.statusCode, 200);
  assert.match(String(css.headers["content-type"]), /^text\/css/);

  const js = await app.inject({ method: "GET", url: "/api/v2/sites/viewer/viewer.js" });
  assert.equal(js.statusCode, 200);
  assert.match(String(js.headers["content-type"]), /javascript/);
  assert.match(String(js.headers["cache-control"]), /max-age=3600/);
});

test("sert le registre de modules et un module de domaine", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());

  const index = await app.inject({ method: "GET", url: "/api/v2/sites/viewer/modules/index.js" });
  assert.equal(index.statusCode, 200);
  assert.match(String(index.headers["content-type"]), /javascript/);

  const geographie = await app.inject({ method: "GET", url: "/api/v2/sites/viewer/modules/geographie.js" });
  assert.equal(geographie.statusCode, 200);
  assert.match(String(geographie.headers["content-type"]), /javascript/);
});

test("sert la traduction manifeste -> entree, importee par viewer.js", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/viewer/manifeste-vers-entree.js" });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /javascript/);
});

test("interdit de sortir de la racine statique", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());

  for (const url of [
    "/api/v2/sites/viewer/../../package.json",
    "/api/v2/sites/viewer/%2e%2e/%2e%2e/package.json",
  ]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 404, url);
  }
});
