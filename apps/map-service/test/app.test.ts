import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import type { MapConfig } from "../src/config.js";

const config: MapConfig = {
  host: "127.0.0.1",
  port: 3003,
  version: "test",
  ignUpstreamUrl: "https://ign.test/wmts",
  brgmUpstreamUrl: "https://brgm.test/wms",
  upstreamTimeoutMs: 1000,
  tileCacheMaxBytes: 1024 * 1024,
  reliefGlobalPath: "/tmp/absent-global.pmtiles",
  reliefHdPath: "/tmp/absent-hd.pmtiles",
  assetsRoot: "/tmp/absent-map-assets",
};

const fetchImpl: typeof fetch = async () => new Response(Buffer.from([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });

test("expose la santé et un état dégradé explicite", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().service, "map-service");
  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().status, "degraded");
  await app.close();
});

test("sert les styles et les légendes", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  const style = await app.inject({ method: "GET", url: "/api/v2/map/styles/territoire.json?fond=photo" });
  assert.equal(style.statusCode, 200);
  assert.equal(style.json().version, 8);
  const legendes = await app.inject({ method: "GET", url: "/api/v2/map/legends" });
  assert.equal(legendes.statusCode, 200);
  assert.ok(legendes.json().length >= 17);
  await app.close();
});

test("met en cache les tuiles IGN", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  const url = "/api/v2/map/tiles/plan/2/1/1.png";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers["x-cache"], "miss");
  assert.equal(second.headers["x-cache"], "hit");
  await app.close();
});

test("refuse un chemin radar détourné", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/v2/map/tiles/radar/2/1/1.png?path=https%3A%2F%2Fexample.org" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "FRAME_RADAR_INVALIDE");
  await app.close();
});
