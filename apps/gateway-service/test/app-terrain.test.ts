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

const failingFetch = (async () => {
  throw new Error("le rendu HTML ne doit appeler aucun service amont");
}) as typeof fetch;

test("GET /valfeu rend l'application mobile de terrain", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  assert.ok(response.body.includes("viewport-fit=cover"));
  assert.ok(response.body.includes('rel="manifest" href="/valfeu/manifest.webmanifest"'));
  assert.ok(response.body.includes("44.081192"));
  assert.ok(response.body.includes("3.641467"));
  for (const label of ["Mairie", "Ma position", "5 km", "20 km", "50 km", "24 h", "7 jours", "Rechercher"]) {
    assert.ok(response.body.includes(label), `l'application doit proposer ${label}`);
  }
  assert.ok(response.body.includes('href="tel:112"'));
  assert.ok(response.body.includes('href="/" aria-label="LAV.feu — retour au portail"'));
  assert.ok(response.body.includes('addEventListener("pointerdown"'));
  assert.ok(response.body.includes("state.map.unproject"));
  assert.ok(response.body.includes('timeZone: "Europe/Paris", timeZoneName: "short"'));
  assert.doesNotMatch(response.body, /navigator\.vibrate/);
});

test("le rayon et la fenêtre temporelle sont deux réglages indépendants", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu" });

  assert.match(response.body, /data-rayon="5"/);
  assert.match(response.body, /data-rayon="20"/);
  assert.match(response.body, /data-rayon="50"/);
  assert.match(response.body, /data-fenetre="1"/);
  assert.match(response.body, /data-fenetre="7"/);
  assert.match(response.body, /radius_km:\s*String\(radius\)/);
  assert.match(response.body, /history_days:\s*String\(days\)/);
});

test("GET /valfeu/ est un alias de l'application", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu/" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes("LAV.feu — Veille incendie"));
});

test("l'ancienne route de l'application redirige vers valfeu", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/app/" });

  assert.equal(response.statusCode, 308);
  assert.equal(response.headers.location, "/valfeu/");
});

test("le manifeste PWA reste sous le scope de l'application", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu/manifest.webmanifest" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /application\/manifest\+json/);
  assert.equal(response.json().start_url, "/valfeu/");
  assert.equal(response.json().scope, "/valfeu/");
});

test("l'icône PWA est servie en SVG", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu/icone.svg" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /image\/svg\+xml/);
  assert.match(response.body, /^<svg/);
});

test("les ressources de l'application ne pointent vers aucun hôte externe", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu" });

  assert.doesNotMatch(response.body, /<script[^>]+src=["']https?:\/\//i);
  assert.doesNotMatch(response.body, /<link[^>]+href=["']https?:\/\//i);
});

test("les scripts inline de l'application sont syntaxiquement valides", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu" });
  const scripts = [...response.body.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? "")
    .filter((script) => script.trim() !== "");

  assert.ok(scripts.length >= 2);
  for (const script of scripts) {
    assert.doesNotThrow(() => new Function(script));
  }
});

type FakeElement = {
  readonly classes: Set<string>;
  innerHTML: string;
  textContent: string;
  disabled: boolean;
  readonly classList: { add(name: string): void; remove(name: string): void };
  addEventListener(): void;
  setAttribute(): void;
  getAttribute(): null;
};

/**
 * Exécute les scripts inline de la page dans un DOM factice minimal afin de vérifier leur
 * comportement au chargement : maplibre-gl.js est servi en "defer", il n'est donc pas encore
 * exécuté au moment où le script inline tourne.
 */
function runTerrainScripts(html: string) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? "")
    .filter((script) => script.trim() !== "");
  assert.ok(scripts.length >= 2);

  const elements = new Map<string, FakeElement>();
  const element = (id: string): FakeElement => {
    const existing = elements.get(id);
    if (existing) return existing;
    const classes = new Set<string>();
    const created: FakeElement = {
      classes,
      innerHTML: "",
      textContent: "",
      disabled: false,
      classList: { add: (name) => void classes.add(name), remove: (name) => void classes.delete(name) },
      addEventListener: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
    };
    elements.set(id, created);
    return created;
  };

  const maps: Array<Record<string, unknown>> = [];
  const maplibregl = {
    Map: function FakeMap(this: Record<string, unknown>, options: Record<string, unknown>) {
      maps.push(options);
      this.addControl = () => {};
      this.on = () => {};
    },
    NavigationControl: function FakeNavigationControl() {},
  };

  const handlers = new Map<string, () => void>();
  const win: Record<string, unknown> = {
    matchMedia: () => ({ matches: false }),
    addEventListener: (type: string, handler: () => void) => void handlers.set(type, handler),
  };
  const doc = {
    readyState: "loading",
    head: { appendChild: () => {} },
    getElementById: element,
    querySelector: () => null,
    querySelectorAll: () => [] as unknown[],
    createElement: () => ({}),
  };

  for (const script of scripts) new Function("window", "document", script)(win, doc);

  return { element, maps, handlers, win, maplibregl };
}

test("la carte n'est initialisée qu'une fois les scripts différés exécutés", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu" });
  const { element, maps, handlers, win, maplibregl } = runTerrainScripts(response.body);

  // Le script inline s'exécute pendant l'analyse du document : maplibregl n'existe pas encore
  // et la page ne doit ni tenter de construire la carte ni afficher le repli.
  assert.equal(maps.length, 0);
  assert.equal(element("map").innerHTML, "");
  assert.equal(element("map").classes.has("map-fallback"), false);

  const onLoad = handlers.get("load");
  assert.equal(typeof onLoad, "function");

  // maplibre-gl.js (defer) est exécuté, puis l'événement load se déclenche.
  win.maplibregl = maplibregl;
  onLoad?.();

  assert.equal(maps.length, 1);
  assert.equal(maps[0]?.container, "map");
  assert.equal(maps[0]?.style, "/api/v2/map/styles/carte.json?fond=plan&ombrage=aucun");
  assert.equal(element("map").classes.has("map-fallback"), false);
});

test("le repli conserve le conteneur de carte et propose un réessai", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: failingFetch });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/valfeu" });
  const { element, maps, handlers } = runTerrainScripts(response.body);

  // maplibregl reste indisponible : le repli s'affiche sans détruire l'élément #map,
  // ce qui laisse une réinitialisation possible sans recharger la page.
  handlers.get("load")?.();

  assert.equal(maps.length, 0);
  assert.equal(element("map").classes.has("map-fallback"), true);
  assert.match(element("map").innerHTML, /id="retry-map"/);
  assert.match(element("source-text").textContent, /Carte indisponible/);
});
