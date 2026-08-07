import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";
import type { ManifesteDalleVue } from "../src/pages/site-instance.js";

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

function fakeFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

function manifesteFixture(overrides: Partial<ManifesteDalleVue> = {}): ManifesteDalleVue {
  return {
    identity: {
      tileId: "ODV-2026-000001",
      title: "Maison",
      center: { lat: 44.064555, lon: 3.683027 },
      widthM: 200,
      heightM: 200,
      areaM2: 40000,
      address: "12 rue du Pont, 30570 Valleraugue",
    },
    production: { createdAt: "2026-08-07T10:00:00.000Z", pipelineVersion: "0.1.0-m1" },
    status: "generated",
    scene: { glb: "/valleraugue-3d/assets/scenes/maison-200m/scene.glb", terrain: null, orthophoto: null },
    data: {
      anthroposphere: [
        {
          key: "commune",
          value: "Valleraugue (30570)",
          unit: null,
          distanceM: null,
          source: { producer: "API Découpage administratif", dataset: "geography/commune", url: null, license: null },
          time: { observedAt: "2026-08-07T09:59:00.000Z", retrievedAt: "2026-08-07T10:00:00.000Z", referencePeriod: null },
          status: { availability: "available", freshness: null, review: null },
        },
      ],
      lithosphere: [
        {
          key: "altitude",
          value: 542.1,
          unit: "m",
          distanceM: null,
          source: { producer: "IGN Géoplateforme — RGE ALTI", dataset: "geography/altitude", url: null, license: null },
          time: { observedAt: "2026-08-07T09:59:00.000Z", retrievedAt: "2026-08-07T10:00:00.000Z", referencePeriod: null },
          status: { availability: "available", freshness: null, review: null },
        },
      ],
    },
    review: { status: "not_started", reviewedAt: null, reviewedBy: null, notes: null },
    ...overrides,
  };
}

test("GET /api/v2/sites/:tileId rend l'identité, la scène 3D et les données par sphère", async (t) => {
  const fetchImpl = fakeFetch(async (input, init) => {
    assert.equal(String(input), "http://site-service:3000/internal/v1/sites/ODV-2026-000001");
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    return new Response(JSON.stringify(manifesteFixture()), { status: 200, headers: { "content-type": "application/json" } });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  assert.ok(response.body.includes("Maison"));
  assert.ok(response.body.includes("ODV-2026-000001"));
  assert.ok(response.body.includes("12 rue du Pont, 30570 Valleraugue"));
  assert.ok(response.body.includes("40 000") || response.body.includes("40 000") || response.body.includes("40,000"), "surface affichée");
  assert.ok(response.body.includes('src="/valleraugue-3d/assets/scenes/maison-200m/scene.glb"'));
  assert.ok(response.body.includes("model-viewer"));
  assert.ok(response.body.includes("Anthroposphère"));
  assert.ok(response.body.includes("Lithosphère"));
  assert.ok(response.body.includes("Valleraugue (30570)"));
  assert.ok(response.body.includes("542.1"));
  assert.ok(response.body.includes("API Découpage administratif"));
  assert.ok(response.body.includes("IGN Géoplateforme")); // provenance listée
});

test("affiche l'absence de scène quand le manifeste n'en porte aucune", async (t) => {
  const fetchImpl = fakeFetch(async () =>
    new Response(JSON.stringify(manifesteFixture({ scene: undefined })), { status: 200, headers: { "content-type": "application/json" } }),
  );
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes("Aucune scène 3D rattachée"));
  assert.ok(!response.body.includes("<model-viewer"));
});

test("affiche l'absence de donnée quand aucune sphère n'est renseignée", async (t) => {
  const fetchImpl = fakeFetch(async () =>
    new Response(JSON.stringify(manifesteFixture({ data: {} })), { status: 200, headers: { "content-type": "application/json" } }),
  );
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes("Aucune donnée collectée"));
});

test("GET /api/v2/sites/:tileId renvoie une page 404 pour une instance introuvable", async (t) => {
  const fetchImpl = fakeFetch(async () => new Response(null, { status: 404 }));
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-999999" });

  assert.equal(response.statusCode, 404);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  assert.ok(response.body.includes("introuvable"));
  assert.ok(response.body.includes("ODV-2026-999999"));
});

test("GET /api/v2/sites/:tileId renvoie une page 502 si site-service est indisponible", async (t) => {
  const fetchImpl = fakeFetch(async () => {
    throw new Error("ECONNREFUSED");
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 502);
  assert.ok(response.body.includes("indisponible"));
});

test("échappe les valeurs injectées dans la page (tileId, titre)", async (t) => {
  const fetchImpl = fakeFetch(async () =>
    new Response(
      JSON.stringify(manifesteFixture({ identity: { ...manifesteFixture().identity, title: "<script>alert(1)</script>" } })),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 200);
  assert.ok(!response.body.includes("<script>alert(1)</script>"));
  assert.ok(response.body.includes("&lt;script&gt;"));
});
