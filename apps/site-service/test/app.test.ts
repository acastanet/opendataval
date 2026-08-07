import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import type { SiteServiceConfig } from "../src/config.js";
import type { ClientGeographie } from "../src/adapters/geography.js";
import { poolFactice } from "./helpers.js";

async function dossierTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "site-service-test-"));
}

function configTest(instancesDir: string): SiteServiceConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    version: "test",
    instancesDir,
    migrationsDir: "unused",
    geographyServiceUrl: "http://geography-service.test",
    geographyServiceTimeoutMs: 1000,
  };
}

const CLIENT_GEOGRAPHIE_VIDE: ClientGeographie = { resoudre: async () => [] };

test("POST /internal/v1/sites crée une instance et renvoie 201 avec le manifeste", async (t) => {
  const racine = await dossierTemporaire();
  t.after(() => rm(racine, { recursive: true, force: true }));

  const { pool } = poolFactice();
  const app = buildApp({ config: configTest(racine), pool, clients: { geographie: CLIENT_GEOGRAPHIE_VIDE }, logger: false });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/internal/v1/sites",
    payload: { lat: 44.064555, lon: 3.683027, title: "Maison" },
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.match(body.identity.tileId, /^ODV-\d{4}-\d{6}$/);
  assert.equal(body.status, "created");
  assert.equal(body.identity.title, "Maison");
});

test("POST /internal/v1/sites refuse un corps sans coordonnées exploitables", async (t) => {
  const racine = await dossierTemporaire();
  t.after(() => rm(racine, { recursive: true, force: true }));

  const { pool } = poolFactice();
  const app = buildApp({ config: configTest(racine), pool, clients: { geographie: CLIENT_GEOGRAPHIE_VIDE }, logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/internal/v1/sites", payload: { lat: "pas un nombre" } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_BODY");
});

test("POST /internal/v1/sites renvoie 400 pour des coordonnées hors bornes", async (t) => {
  const racine = await dossierTemporaire();
  t.after(() => rm(racine, { recursive: true, force: true }));

  const { pool } = poolFactice();
  const app = buildApp({ config: configTest(racine), pool, clients: { geographie: CLIENT_GEOGRAPHIE_VIDE }, logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/internal/v1/sites", payload: { lat: 200, lon: 3 } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_COORDINATES");
});

test("GET /internal/v1/sites/:tileId relit l'instance créée, 404 sinon", async (t) => {
  const racine = await dossierTemporaire();
  t.after(() => rm(racine, { recursive: true, force: true }));

  const { pool } = poolFactice();
  const app = buildApp({ config: configTest(racine), pool, clients: { geographie: CLIENT_GEOGRAPHIE_VIDE }, logger: false });
  t.after(() => app.close());

  const creation = await app.inject({ method: "POST", url: "/internal/v1/sites", payload: { lat: 44.064555, lon: 3.683027 } });
  const tileId = creation.json().identity.tileId;

  const lecture = await app.inject({ method: "GET", url: `/internal/v1/sites/${tileId}` });
  assert.equal(lecture.statusCode, 200);
  assert.equal(lecture.json().identity.tileId, tileId);

  const absente = await app.inject({ method: "GET", url: "/internal/v1/sites/ODV-2026-999999" });
  assert.equal(absente.statusCode, 404);
  assert.equal(absente.json().error.code, "SITE_NOT_FOUND");
});

test("POST /internal/v1/sites/:tileId/build fait progresser l'instance jusqu'à generated", async (t) => {
  const racine = await dossierTemporaire();
  t.after(() => rm(racine, { recursive: true, force: true }));

  const { pool } = poolFactice();
  const app = buildApp({ config: configTest(racine), pool, clients: { geographie: CLIENT_GEOGRAPHIE_VIDE }, logger: false });
  t.after(() => app.close());

  const creation = await app.inject({ method: "POST", url: "/internal/v1/sites", payload: { lat: 44.064555, lon: 3.683027 } });
  const tileId = creation.json().identity.tileId;

  const build = await app.inject({ method: "POST", url: `/internal/v1/sites/${tileId}/build` });
  assert.equal(build.statusCode, 200);
  assert.equal(build.json().status, "generated");
});

test("POST /internal/v1/sites/:tileId/build renvoie 404 pour une instance introuvable", async (t) => {
  const racine = await dossierTemporaire();
  t.after(() => rm(racine, { recursive: true, force: true }));

  const { pool } = poolFactice();
  const app = buildApp({ config: configTest(racine), pool, clients: { geographie: CLIENT_GEOGRAPHIE_VIDE }, logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/internal/v1/sites/ODV-2026-999999/build" });
  assert.equal(response.statusCode, 404);
});

test("expose /health et /ready", async (t) => {
  const racine = await dossierTemporaire();
  t.after(() => rm(racine, { recursive: true, force: true }));

  const { pool } = poolFactice();
  const app = buildApp({ config: configTest(racine), pool, clients: { geographie: CLIENT_GEOGRAPHIE_VIDE }, logger: false });
  t.after(() => app.close());

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().service, "site-service");

  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(ready.statusCode, 200);
});
