import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { buildApp } from "../src/app.js";
import type { OldConfig } from "../src/config.js";
import type { OldSourceClients } from "../src/types.js";

const config: OldConfig = {
  host: "127.0.0.1",
  port: 3000,
  version: "test",
  apiCartoUrl: "http://api-carto.test",
  wfsUrl: "http://wfs.test",
  upstreamTimeoutMs: 100,
  buildingSearchRadiusMeters: 75,
};

const building: Polygon = {
  type: "Polygon",
  coordinates: [[
    [3.6829, 44.0645],
    [3.6831, 44.0645],
    [3.6831, 44.06465],
    [3.6829, 44.06465],
    [3.6829, 44.0645],
  ]],
};
const parcel: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [[[
    [3.6828, 44.0644],
    [3.6832, 44.0644],
    [3.6832, 44.06475],
    [3.6828, 44.06475],
    [3.6828, 44.0644],
  ]]],
};
const collection = (features: FeatureCollection["features"]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

function clients(overrides: Partial<OldSourceClients> = {}): OldSourceClients {
  return {
    buildings: async () => collection([{
      type: "Feature",
      id: "batiment.test",
      geometry: building,
      properties: { nature: "Indifférenciée", usage_1: "Résidentiel" },
    }]),
    parcel: async () => collection([{
      type: "Feature",
      id: "parcelle.test",
      geometry: parcel,
      properties: { idu: "303390000E2151", contenance: 280, code_insee: "30339" },
    }]),
    urbanism: async () => collection([{
      type: "Feature",
      geometry: parcel,
      properties: { typezone: "A", libelong: "Zone agricole" },
    }]),
    applicability: async () => collection([{
      type: "Feature",
      geometry: parcel,
      properties: { id: "old.test", zonage: 2, source: "Zonage local" },
    }]),
    ...overrides,
  };
}

test("calcule le tampon depuis le bâtiment et expose les sources", async (t) => {
  const app = buildApp({
    config,
    clients: clients(),
    logger: false,
    now: () => new Date("2026-08-02T12:00:00.000Z"),
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/internal/v1/old/perimetre?lon=3.68302778&lat=44.06455556",
    headers: { "x-request-id": "old-test" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-request-id"], "old-test");
  const body = response.json();
  assert.equal(body.status, "indicatif");
  assert.equal(body.applicable, true);
  assert.equal(body.calculation.method, "buffer_batiment");
  assert.equal(body.calculation.includesPrivateAccess, false);
  assert.ok(body.calculation.surfaceM2 > 7_000);
  assert.equal(body.geojson.features[0].properties.layer, "old-perimetre-calcule");
  assert.equal(body.geojson.features[1].properties.layer, "old-batiment-source");
});

test("retombe sur un cercle provisoire sans bâtiment", async (t) => {
  const app = buildApp({
    config,
    clients: clients({ buildings: async () => collection([]) }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/old/perimetre?lon=3.68302778&lat=44.06455556",
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, "provisoire");
  assert.equal(body.calculation.method, "buffer_point_provisoire");
  assert.ok(body.calculation.surfaceM2 > 7_700 && body.calculation.surfaceM2 < 8_000);
  assert.match(body.warnings[0], /cercle provisoire/);
});

test("ajoute la partie cadastrale située en zone U", async (t) => {
  const app = buildApp({
    config,
    clients: clients({
      urbanism: async () => collection([{
        type: "Feature",
        geometry: parcel,
        properties: { typezone: "U", libelong: "Zone urbaine" },
      }]),
    }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/old/perimetre?lon=3.68302778&lat=44.06455556",
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(body.calculation.includesUrbanParcelPortion, true);
  assert.match(body.calculation.method, /partie_parcelle_zone_u/);
});

test("conserve un calcul dégradé lorsque le zonage OLD est indisponible", async (t) => {
  const app = buildApp({
    config,
    clients: clients({ applicability: async () => { throw new Error("timeout"); } }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/old/perimetre?lon=3.68302778&lat=44.06455556",
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(body.applicable, null);
  assert.equal(body.applicability.status, "unavailable");
  assert.match(body.warnings.join(" "), /zonage national/);
});

test("refuse les coordonnées et distances invalides", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/old/perimetre?lon=3.68&lat=95&distance_m=0",
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_QUERY");
});
