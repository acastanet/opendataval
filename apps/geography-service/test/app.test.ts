import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GeographyConfig } from "../src/config.js";
import type { GeographyClients } from "../src/services/resolve-location.js";

const config: GeographyConfig = { host: "127.0.0.1", port: 3000, territoryUpstreamUrl: "http://territory", reverseGeocodingUpstreamUrl: "http://address", elevationUpstreamUrl: "http://elevation", territoryTimeoutMs: 100, reverseGeocodingTimeoutMs: 100, elevationTimeoutMs: 100, globalTimeoutMs: 100, version: "test" };
const clients: GeographyClients = { territory: { resolve: async () => ({ label: "Val-d'Aigoual", commune: { name: "Val-d'Aigoual", inseeCode: "30339" }, department: { name: "Gard", code: "30" }, epci: { name: "Causses Aigoual", code: "200034601" } }) }, address: { resolve: async () => ({ formatted: "Rue de la Mairie, 30570 Val-d'Aigoual", houseNumber: null, street: "Rue de la Mairie", postalCode: "30570", city: "Val-d'Aigoual", precision: "street", distanceMeters: 18 }) }, elevation: { resolve: async () => 366 } };

test("résout les enrichissements indépendants et propage x-request-id", async (t) => {
  const app = buildApp({ config, clients, logger: false, now: () => new Date("2026-07-23T14:00:00.000Z") }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/internal/v1/geography/resolve?lat=44.081&lon=3.641&horizontalAccuracyMeters=12&positionSource=browser-geolocation", headers: { "x-request-id": "req-geography" } });
  assert.equal(response.statusCode, 200); assert.equal(response.headers["x-request-id"], "req-geography");
  const body = response.json(); assert.equal(body.query.horizontalAccuracyMeters, 12); assert.equal(body.territory.status, "available"); assert.equal(body.address.data.distanceMeters, 18); assert.equal(body.elevation.data.verticalDatum, "NGF-IGN69"); assert.equal(body.requestId, "req-geography");
});

test("retourne une réponse partielle lorsqu'un fournisseur échoue", async (t) => {
  const app = buildApp({ config, logger: false, clients: { ...clients, address: { resolve: async () => { throw new DOMException("timeout", "TimeoutError"); } } } }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/internal/v1/geography/resolve?lat=44&lon=3" });
  assert.equal(response.statusCode, 200); assert.equal(response.json().address.status, "timeout");
});

test("refuse les coordonnées invalides", async (t) => {
  const app = buildApp({ config, clients, logger: false }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/internal/v1/geography/resolve?lat=91&lon=3" });
  assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_COORDINATES");
});

test("refuse les paramètres obligatoires absents", async (t) => {
  const app = buildApp({ config, clients, logger: false }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/internal/v1/geography/resolve?lat=44" });
  assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_COORDINATES");
});
