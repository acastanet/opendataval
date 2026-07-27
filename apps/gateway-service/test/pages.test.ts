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
  vigilanceServiceUrl: "http://weather-vigilance-service:3000",
  vigilanceServiceTimeoutMs: 100,
  fireDetectionServiceUrl: "http://fire-detection-service:3000",
  fireDetectionServiceTimeoutMs: 100,
  version: "test",
};

// Les pages HTML ne font aucun appel amont côté serveur : le fetch ne doit pas
// être invoqué lors de leur rendu.
const failingFetch = (async () => {
  throw new Error("le rendu HTML ne doit appeler aucun service amont");
}) as typeof fetch;

test("GET /api/v2 renvoie la landing HTML listant les microservices", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  for (const name of ["Geography", "Weather", "Weather Vigilance", "Fire Detection", "Associations", "Gateway", "Map"]) {
    assert.ok(response.body.includes(name), `landing doit mentionner ${name}`);
  }
  assert.ok(response.body.includes("/api/v2/geography/resolve"));
  assert.ok(response.body.includes("/api/v2/demo/fire"));
  assert.ok(response.body.includes("/api/v2/demo/map"));
  assert.ok(response.body.includes('href="/api/v2/app/"'));
});

test("depuis l'accueil, la démo Associations propose la recherche consolidée", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const landing = await app.inject({ method: "GET", url: "/api/v2" });
  const demoPath = landing.body.match(/href="(\/api\/v2\/demo\/associations)"/)?.[1];

  assert.equal(demoPath, "/api/v2/demo/associations");
  const demo = await app.inject({ method: "GET", url: demoPath });

  assert.equal(demo.statusCode, 200);
  assert.match(String(demo.headers["content-type"]), /text\/html/);
  assert.ok(demo.body.includes("Liste consolidée, recherchable et cartographiable"));
  assert.ok(demo.body.includes('name="code_insee"'));
  assert.ok(demo.body.includes('value="30339"'));
  for (const field of ["q", "status", "category_primary", "category_secondary", "limit", "cursor"]) {
    assert.ok(demo.body.includes(`name="${field}"`), `la démo doit proposer le champ ${field}`);
  }
  assert.ok(demo.body.includes('"basePath":"/api/v2/associations"'));
  assert.ok(demo.body.includes("Associations trouvées"));
  assert.ok(demo.body.includes("administrativeStatus"));
  assert.ok(demo.body.includes("snapshotUpdatedAt"));
  assert.ok(demo.body.includes("freshness"));
  assert.ok(demo.body.includes('id="associations-export"'));
  assert.ok(demo.body.includes('id="associations-export-columns"'));
  assert.ok(demo.body.includes('name="association-export-column"'));
  assert.ok(demo.body.includes("Exporter les colonnes sélectionnées au format Excel"));
  assert.ok(demo.body.includes("loadAssociationPages"));
  assert.ok(demo.body.includes("Identifiant RNA"));
  assert.ok(demo.body.includes("Voir toutes les informations"));
  assert.ok(demo.body.includes("001000 - SPORTS"));
  assert.ok(demo.body.includes("024010 : Clubs canins"));
  for (const script of demo.body.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Function(script[1]!));
  }
  assert.ok(demo.body.includes("Retour à l'accueil des API v2"));
});

test("GET /api/v2/ (slash final) renvoie aussi la landing", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/);
});

test("GET /api/v2/demo/:service rend une page de démo avec formulaire", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/geography" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  assert.ok(response.body.includes('id="demo-form"'));
  assert.ok(response.body.includes('name="lat"'));
  assert.ok(response.body.includes("Retour à l'accueil des API v2"));
});

test("la démo d'un service géographique propose onglets, géolocalisation et carte", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/geography" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('role="tablist"'));
  assert.ok(response.body.includes(">Résultat<"));
  assert.ok(response.body.includes(">JSON brut<"));
  assert.ok(response.body.includes(">Me localiser<"));
  assert.ok(response.body.includes("unpkg.com/leaflet@1.9.4"));
  assert.ok(response.body.includes('id="map"'));
});

test("la démo fire active le tracé des détections sur la carte", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/fire" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('"drawDetections":true'));
  assert.ok(response.body.includes('id="map"'));
  assert.ok(response.body.includes("État des sources"));
  assert.ok(response.body.includes("Fenêtre temps réel"));
  assert.ok(response.body.includes("detection_count"));
  assert.ok(response.body.includes("history.suspicions"));
  assert.ok(response.body.includes("FIRMS_VIIRS_SNPP_NRT"));
  assert.ok(response.body.includes("EUMETSAT_MTG_CAP"));
  assert.ok(response.body.includes("Sources satellitaires"));
  assert.ok(response.body.includes("Puissance radiative"));
  assert.ok(response.body.includes("Rayon du pixel"));
});

test("la démo map charge MapLibre depuis map-service et propose les styles", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/map" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes("/api/v2/map/vendor/maplibre-gl.js"));
  assert.ok(response.body.includes("/api/v2/map/styles/territoire.json"));
  assert.ok(response.body.includes('id="map-style"'));
  assert.ok(response.body.includes("Hypsométrique"));
  assert.ok(response.body.includes('id="map-fond"'));
  assert.ok(response.body.includes('id="map-geologie"'));
  assert.ok(response.body.includes('id="map-relief"'));
  assert.ok(response.body.includes("Afficher le relief en 3D"));
  assert.ok(response.body.includes('id="map-exageration"'));
  assert.ok(response.body.includes('id="map-style-json"'));
  assert.ok(response.body.includes('id="map-legend"'));
  assert.ok(response.body.includes('id="map-activity"'));
  assert.ok(response.body.includes("/api/v2/map/legends"));
  assert.ok(!response.body.includes("unpkg.com"));
});

test("la démo vigilance vide le code département lors d'une localisation", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/vigilance" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('"clearOnLocate":["department_code"]'));
});

test("la démo legacy garde les onglets mais sans géolocalisation ni carte", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/legacy" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('role="tablist"'));
  assert.ok(!response.body.includes(">Me localiser<"));
  assert.ok(!response.body.includes("unpkg.com"));
  assert.ok(!response.body.includes('id="map"'));
});

test("la configuration inline de la démo n'expose aucune balise script littérale", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/geography" });

  // Le JSON de configuration échappe tout `<` : la charge utile ne doit contenir
  // aucun chevron ouvrant (donc aucune séquence `</script>`) hors de la balise.
  const match = response.body.match(/window\.__demo = (.*?);<\/script>/);
  assert.ok(match, "la configuration inline doit être présente");
  assert.ok(!match![1]!.includes("<"), "le JSON inline ne doit contenir aucun chevron ouvrant");
});

test("GET /api/v2/demo/:service inconnu renvoie 404 JSON", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/demo/inconnu" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "UNKNOWN_SERVICE");
});
