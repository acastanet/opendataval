import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { ItineraireConfig } from "../src/config.js";
import type { RestrictionsIndex } from "../src/restrictions.js";
import { ValhallaRouteError, ValhallaUnavailableError } from "../src/valhalla.js";
import type { ValhallaClient } from "../src/types.js";

const config: ItineraireConfig = { host: "127.0.0.1", port: 3000, version: "test", valhallaUrl: "http://valhalla.test", valhallaTimeoutMs: 100, restrictionsFile: "missing.json" };
const route = (wayId: string) => ({ durationS: 120, distanceKm: 2, geojson: { type: "LineString" as const, coordinates: [[3.6, 44], [3.61, 44.01]] }, steps: [{ instruction: "Continuer", distanceKm: 2, durationS: 120 }], edges: [{ wayId, lengthKm: 2, name: "D 986" }] });
const truckRoute = { ...route("10"), edges: [{ wayId: "10", lengthKm: 1, name: "D 986" }, { wayId: "11", lengthKm: 1, name: "D 986" }] };
const client: ValhallaClient = { route: async (_vehicle, costing) => costing === "truck" ? truckRoute : route("20") };
const query = "lon_depart=3.64&lat_depart=44.08&lon_arrivee=3.61&lat_arrivee=43.99&hauteur_m=4.1&largeur_m=2.55&longueur_m=16.5&poids_t=38&charge_essieu_t=11.5&nb_essieux=5&matieres_dangereuses=0";

test("calcule un itinéraire PL et rend visibles les inconnues et obstacles", async (t) => {
  const restrictions: RestrictionsIndex = new Map([
    ["10", { wayId: "10", nom: "Pont du trajet", tags: { maxheight: "3.5" }, geometry: { type: "LineString", coordinates: [[3.6, 44], [3.61, 44.01]] } }],
    ["20", { wayId: "20", nom: "Pont bas", tags: { maxheight: "3.5" }, geometry: { type: "LineString", coordinates: [[3.6, 44], [3.61, 44.01]] } }],
  ]);
  const app = buildApp({ config, client, restrictions, logger: false, now: () => new Date("2026-08-04T12:00:00.000Z") }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query}`, headers: { "x-request-id": "itineraire-test" } });
  assert.equal(response.statusCode, 200); assert.equal(response.headers["x-request-id"], "itineraire-test");
  const body = response.json(); assert.equal(body.statut, "ok"); assert.equal(body.gabarit_non_verifie.part_lineaire, 0.5); assert.equal(body.obstacles_evites[0].nom, "Pont bas"); assert.equal(body.gabarits_trajet[0].limites[0].type, "Hauteur maximale"); assert.equal(body.gabarits_trajet[0].incompatible, true); assert.equal(body.confiance.niveau, "moyenne");
});

test("traduit les valeurs OSM et regroupe les gabarits identiques", async (t) => {
  const sameRoad = { ...truckRoute, edges: [{ wayId: "30", lengthKm: 1, name: "La Comtoise" }, { wayId: "31", lengthKm: 1, name: "La Comtoise" }] };
  const localClient: ValhallaClient = { route: async (_vehicle, costing) => costing === "truck" ? sameRoad : route("20") };
  const restrictions: RestrictionsIndex = new Map([
    ["30", { wayId: "30", tags: { maxheight: "below_default" } }],
    ["31", { wayId: "31", tags: { maxheight: "below_default" } }],
  ]);
  const app = buildApp({ config, client: localClient, restrictions, logger: false }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query}` });
  assert.equal(response.statusCode, 200); assert.equal(response.json().gabarits_trajet.length, 1); assert.equal(response.json().gabarits_trajet[0].limites[0].valeur, "inférieure à la limite réglementaire");
});

test("refuse toute query incomplète ou physiquement invraisemblable", async (t) => {
  const app = buildApp({ config, client, restrictions: new Map(), logger: false }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query.replace("hauteur_m=4.1", "hauteur_m=42")}` });
  assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_QUERY");
});

test("refuse un trajet hors du corridor Doubs–Cévennes", async (t) => {
  const app = buildApp({ config, client, restrictions: new Map(), logger: false }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query.replace("lon_depart=3.64", "lon_depart=8.31").replace("lat_depart=44.08", "lat_depart=49.13")}` });
  assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_QUERY");
});

test("signale explicitement Valhalla non prêt", async (t) => {
  const unavailable: ValhallaClient = { route: async () => { throw new ValhallaUnavailableError("pas prêt"); } };
  const app = buildApp({ config, client: unavailable, restrictions: new Map(), logger: false }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query}` });
  assert.equal(response.statusCode, 503); assert.equal(response.json().error.code, "VALHALLA_UNAVAILABLE");
});

test("explique quand un point ne peut pas être rattaché au réseau routier", async (t) => {
  const noRoute: ValhallaClient = { route: async () => { throw new ValhallaRouteError("aucune arête"); } };
  const app = buildApp({ config, client: noRoute, restrictions: new Map(), logger: false }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/itineraire/poids-lourd?${query}` });
  assert.equal(response.statusCode, 422); assert.equal(response.json().error.code, "ROUTE_NOT_FOUND");
});
