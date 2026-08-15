import test from "node:test";
import assert from "node:assert/strict";
import { ALTIMETRIE_IGN, REGIONS_RELIEF } from "@opendata-vda/shared/carto";
import { buildApp } from "../src/app.js";
import type { MapConfig } from "../src/config.js";
import { empriseLambert } from "../src/domain/lambert93.js";

/** Tuile z16 centrée sur Valleraugue, celle que servent les essais d'altimétrie. */
const TUILE_HD = { z: 16, x: 33441, y: 23850 };

const config: MapConfig = {
  host: "127.0.0.1",
  port: 3003,
  version: "test",
  ignUpstreamUrl: "https://ign.test/wmts",
  ignAltimetrieUrl: "https://ign.test/wms-r/wms",
  ignAltimetrieLayer: ALTIMETRIE_IGN.couche,
  brgmUpstreamUrl: "https://brgm.test/wms",
  upstreamTimeoutMs: 1000,
  tileCacheMaxBytes: 1024 * 1024,
  reliefRegions: REGIONS_RELIEF.map((region) => ({
    id: region.id,
    bounds: region.bounds,
    globalPath: `/tmp/absent-${region.id}-global.pmtiles`,
    hdPath: `/tmp/absent-${region.id}-hd.pmtiles`,
  })),
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

test("sert le style unique et les légendes", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  const style = await app.inject({ method: "GET", url: "/api/v2/map/styles/carte.json?fond=photo&ombrage=multi" });
  assert.equal(style.statusCode, 200);
  assert.equal(style.json().version, 8);
  const legendes = await app.inject({ method: "GET", url: "/api/v2/map/legends" });
  assert.equal(legendes.statusCode, 200);
  const index = legendes.json() as { id: string }[];
  assert.ok(index.some((item) => item.id === "relief-hypsometrique"));
  assert.ok(index.some((item) => item.id === "vigilance-feu"));
  await app.close();
});

test("oriente les anciens noms de style vers le style unique", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  for (const ancien of ["plan", "territoire", "relief", "hypsometrique"]) {
    const response = await app.inject({ method: "GET", url: `/api/v2/map/styles/${ancien}.json` });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "STYLE_INCONNU");
    assert.match(response.json().error.message, /carte\.json/);
  }
  const inconnu = await app.inject({ method: "GET", url: "/api/v2/map/styles/inexistant.json" });
  assert.equal(inconnu.statusCode, 404);
  await app.close();
});

test("refuse un ombrage hors préréglages", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/v2/map/styles/carte.json?ombrage=brutal" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "OPTIONS_STYLE_INVALIDES");
  await app.close();
});

test("signale l’absence des archives de relief sur les deux extensions", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  // Tuile centrée dans la région aigoual (3.65°E, 44.12°N) : la région est trouvée, mais ses
  // archives ne sont pas montées, d'où le 503 plutôt qu'un 404 « hors couverture ».
  for (const url of ["/api/v2/map/relief/12/2089/1487.webp", "/api/v2/map/relief/12/2089/1487.png"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "RELIEF_INDISPONIBLE");
  }
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

test("sert une tuile transparente lorsque la couverture IGN est absente", async () => {
  const absentFetch: typeof fetch = async () => new Response(null, { status: 404 });
  const app = buildApp({ config, fetchImpl: absentFetch, logger: false });
  const url = "/api/v2/map/tiles/plan/8/131/96.png";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.headers["content-type"], "image/png");
  assert.equal(first.headers["x-cache"], "miss");
  assert.ok(first.rawPayload.byteLength > 0);
  assert.equal(second.headers["x-cache"], "hit");
  await app.close();
});

test("convertit et met en cache une tuile d’altitude haute définition", async () => {
  const emprise = empriseLambert(TUILE_HD);
  const bil = Buffer.alloc(emprise.largeur * emprise.hauteur * 4);
  for (let i = 0; i < emprise.largeur * emprise.hauteur; i++) bil.writeFloatLE(250 + (i % 100) / 8, i * 4);
  let appels = 0;
  const altiFetch: typeof fetch = async (url) => {
    appels++;
    const parametres = new URL(String(url)).searchParams;
    assert.equal(parametres.get("LAYERS"), config.ignAltimetrieLayer);
    // Interrogé en mercator, le RGE ALTI ressort d'une pyramide quatre fois plus grossière.
    assert.equal(parametres.get("CRS"), "EPSG:2154");
    assert.equal(parametres.get("WIDTH"), String(emprise.largeur));
    return new Response(bil, { status: 200, headers: { "content-type": "image/x-bil;bits=32" } });
  };
  const app = buildApp({ config, fetchImpl: altiFetch, logger: false });
  const url = "/api/v2/map/relief-hd/16/33441/23850.png";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.headers["content-type"], "image/png");
  assert.equal(first.headers["x-cache"], "miss");
  assert.equal(first.rawPayload.toString("ascii", 12, 16), "IHDR");
  assert.equal(second.headers["x-cache"], "hit");
  assert.equal(appels, 1, "la seconde requête doit être servie par le cache");
  await app.close();
});

test("sert les archives locales sous le seuil du relief haute définition", async () => {
  // La pyramide doit rester complète : MapLibre charge les tuiles parentes en se déplaçant,
  // jusqu'à 0/0/0. Ici les archives sont absentes, d'où le 503 — mais l'appel les vise bien,
  // sans solliciter l'IGN. Tuile centrée dans la région aigoual (3.87°E, 44.34°N).
  let appels = 0;
  const espion: typeof fetch = async (...args) => { appels++; return fetchImpl(...args); };
  const app = buildApp({ config, fetchImpl: espion, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/v2/map/relief-hd/9/261/185.png" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "RELIEF_INDISPONIBLE");
  assert.equal(appels, 0, "aucun appel amont sous le seuil");
  await app.close();
});

test("borne le relief haute définition au dernier zoom utile", async () => {
  // z17 en 512 px vaudrait 0,43 m/px pour une source à 1 m : rien de plus à voir, et le réseau
  // de la grille métrique redevient visible sous l'ombrage. Au-delà, MapLibre agrandit z16.
  const app = buildApp({ config, fetchImpl, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/v2/map/relief-hd/17/66882/47700.png" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "TUILE_INVALIDE");
  await app.close();
});

test("normalise l’indisponibilité du service altimétrique", async () => {
  const enPanne: typeof fetch = async () => new Response(null, { status: 503 });
  const app = buildApp({ config, fetchImpl: enPanne, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/v2/map/relief-hd/16/33441/23850.png" });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, "TUILE_AMONT_INDISPONIBLE");
  assert.equal(response.json().error.retryable, true);
  await app.close();
});

test("rend une tuile vide plutôt qu’une erreur quand le fond amont expire", async () => {
  const lent: typeof fetch = async () => {
    const erreur = new Error("The operation was aborted due to timeout");
    erreur.name = "TimeoutError";
    throw erreur;
  };
  const app = buildApp({ config, fetchImpl: lent, logger: false });
  const url = "/api/v2/map/tiles/plan/10/522/372.png";
  const first = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.headers["content-type"], "image/png");
  assert.equal(first.headers["x-tuile"], "indisponible");
  // Jamais mémorisée : la vraie tuile doit revenir dès que l'amont répond.
  assert.equal(first.headers["cache-control"], "no-store");
  const second = await app.inject({ method: "GET", url });
  assert.equal(second.headers["x-tuile"], "indisponible");
  await app.close();
});

test("ne réessaie pas un amont qui a dépassé le délai", async () => {
  let appels = 0;
  const lent: typeof fetch = async () => {
    appels++;
    const erreur = new Error("timeout");
    erreur.name = "TimeoutError";
    throw erreur;
  };
  const app = buildApp({ config, fetchImpl: lent, logger: false });
  await app.inject({ method: "GET", url: "/api/v2/map/tiles/plan/10/522/373.png" });
  // Relancer une requête déjà trop lente ne ferait que doubler l'attente.
  assert.equal(appels, 1);
  await app.close();
});

test("accorde une seconde chance à une coupure immédiate", async () => {
  let appels = 0;
  const instable: typeof fetch = async () => {
    appels++;
    if (appels === 1) throw new TypeError("fetch failed");
    return new Response(Buffer.from([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
  };
  const app = buildApp({ config, fetchImpl: instable, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/v2/map/tiles/plan/10/522/374.png" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-tuile"], undefined);
  assert.equal(appels, 2);
  await app.close();
});

test("refuse un chemin radar détourné", async () => {
  const app = buildApp({ config, fetchImpl, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/v2/map/tiles/radar/2/1/1.png?path=https%3A%2F%2Fexample.org" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "FRAME_RADAR_INVALIDE");
  await app.close();
});
