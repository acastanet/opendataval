import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

const config: GatewayConfig = { host: "127.0.0.1", port: 3000, legacyApiUrl: "http://legacy-api:3000", upstreamTimeoutMs: 100, geographyServiceUrl: "http://geography-service:3000", geographyServiceTimeoutMs: 100, weatherServiceUrl: "http://weather-service:3000", weatherServiceTimeoutMs: 100, oldServiceUrl: "http://old-service:3000", oldServiceTimeoutMs: 100, itineraireServiceUrl: "http://itineraire-service:3000", itineraireServiceTimeoutMs: 100, version: "test" };
const query = "lon_depart=3.64&lat_depart=44.08&lon_arrivee=3.61&lat_arrivee=43.99&hauteur_m=4.1&largeur_m=2.55&longueur_m=16.5&poids_t=38&charge_essieu_t=11.5&nb_essieux=5&matieres_dangereuses=0";

test("relaie l’itinéraire PL, son URL et le request-id", async (t) => {
  let calledUrl = ""; let calledRequestId = "";
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => { calledUrl = String(input); calledRequestId = new Headers(init?.headers).get("x-request-id") ?? ""; return Response.json({ statut: "ok" }); }) as typeof fetch;
  const app = buildApp({ config, logger: false, fetchImpl }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query}`, headers: { "x-request-id": "req-itineraire" } });
  assert.equal(response.statusCode, 200); assert.equal(response.headers["x-request-id"], "req-itineraire"); assert.equal(calledRequestId, "req-itineraire");
  assert.equal(calledUrl, `http://itineraire-service:3000/internal/v1/itineraire/poids-lourd?${query}`);
});

test("normalise l’indisponibilité du service d’itinéraire", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: (async () => { throw new Error("connexion refusée"); }) as typeof fetch }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query}` });
  assert.equal(response.statusCode, 502); assert.equal(response.json().error.code, "ITINERAIRE_SERVICE_UNAVAILABLE");
});

test("rejette une query syntaxiquement invalide sans appel amont", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: (async () => { throw new Error("ne doit pas être appelé"); }) as typeof fetch }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?lon_depart=${"1".repeat(41)}` });
  assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_QUERY");
});
