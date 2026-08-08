import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";
import { manifesteApercu } from "../src/pages/dalle/fixtures.js";

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

test("GET /api/v2/sites/:tileId rend le viewer et embarque le manifeste", async (t) => {
  const fetchImpl = fakeFetch(async (input, init) => {
    assert.equal(String(input), "http://site-service:3000/internal/v1/sites/ODV-2026-000001");
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    return new Response(JSON.stringify(manifesteApercu()), { status: 200 });
  });
  const app = buildApp({ config, logger: false, fetchImpl });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  assert.ok(response.body.includes("Maison de Valleraugue"));
  assert.ok(response.body.includes("Centre 44.064623, 3.682975"));
  assert.ok(response.body.includes('id="manifeste-dalle"'));
  assert.ok(response.body.includes('src="/api/v2/sites/viewer/viewer.js'));
  assert.ok(response.body.includes('href="/api/v2/sites/viewer/styles.css'));
  assert.ok(response.body.includes("/valleraugue-3d/assets/scenes/maison-200m/scene.glb"));
  assert.ok(response.body.includes('id="sphereControls"'));
});

test("embarque aussi les états sans scène et sans donnée", async (t) => {
  const manifeste = manifesteApercu({ scene: undefined, data: {} });
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => new Response(JSON.stringify(manifeste), { status: 200 })),
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 200);
  const bloc = response.body.match(/<script type="application\/json" id="manifeste-dalle">(.*?)<\/script>/s);
  assert.ok(bloc?.[1]);
  const embarque = JSON.parse(bloc[1]);
  assert.equal(embarque.scene, undefined);
  assert.deepEqual(embarque.data, {});
});

test("GET /api/v2/sites/:tileId renvoie une page 404 pour une instance introuvable", async (t) => {
  const app = buildApp({ config, logger: false, fetchImpl: fakeFetch(async () => new Response(null, { status: 404 })) });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-999999" });

  assert.equal(response.statusCode, 404);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  assert.ok(response.body.includes("introuvable"));
  assert.ok(response.body.includes("ODV-2026-999999"));
});

test("GET /api/v2/sites/:tileId renvoie une page 502 si site-service est indisponible", async (t) => {
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => { throw new Error("ECONNREFUSED"); }),
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 502);
  assert.ok(response.body.includes("indisponible"));
});

test("échappe le titre HTML et neutralise une fermeture de script dans le manifeste", async (t) => {
  const titre = "</script><script>alert(1)</script>";
  const manifeste = manifesteApercu({
    identity: { ...manifesteApercu().identity, title: titre },
  });
  const app = buildApp({
    config,
    logger: false,
    fetchImpl: fakeFetch(async () => new Response(JSON.stringify(manifeste), { status: 200 })),
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/v2/sites/ODV-2026-000001" });

  assert.equal(response.statusCode, 200);
  assert.ok(!response.body.includes(titre));
  assert.ok(response.body.includes("&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"));
  const bloc = response.body.match(/<script type="application\/json" id="manifeste-dalle">(.*?)<\/script>/s);
  assert.ok(bloc?.[1]);
  assert.ok(bloc[1].includes("\\u003c/script>"));
  assert.equal(JSON.parse(bloc[1]).identity.title, titre);
});
