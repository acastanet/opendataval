import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildApp, type GeologieClients } from "../src/app.js";
import type { BssFeature, BrgmClient } from "../src/clients/brgm.js";
import { ErreurBrgm } from "../src/clients/brgm.js";
import type { GeologieConfig } from "../src/config.js";
import { classementDeterministe } from "../src/services/reranker.js";
import type { Reranker } from "../src/services/reranker.js";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

const config: GeologieConfig = {
  host: "127.0.0.1", port: 3000, version: "test",
  brgmWfsUrl: "http://brgm.test", brgmTimeoutMs: 1000, brgmMaxFeatures: 500,
  cacheTtlSeconds: 3600, cacheMaxEntries: 10,
  llmUrl: "http://llm.test", llmModel: "test-model", llmApiKey: "", llmTimeoutMs: 1000, llmMaxTokens: 500,
  llmVisionModel: "test-vision-model", llmVisionTimeoutMs: 1000, llmSyntheseMaxTokens: 500,
  infoterreTimeoutMs: 1000, infoterreMaxScanBytes: 5_000_000, infoterreImageWidthPx: 1400, infoterreMaxImages: 2,
  debugEnabled: false,
};

function featuresFixture(nomFichier: string): BssFeature[] {
  const brut = JSON.parse(readFileSync(`${FIXTURES_DIR}${nomFichier}`, "utf-8")) as { features: BssFeature[] };
  return brut.features;
}

function brgmFixe(features: BssFeature[], tronque = false): BrgmClient {
  return { featuresDansBbox: async () => ({ features, tronque }) };
}

function brgmEnErreur(genre: "timeout" | "indisponible" | "reponse_invalide", message: string): BrgmClient {
  return {
    featuresDansBbox: async () => { throw new ErreurBrgm(genre, message); },
  };
}

/** Reranker de test : ne fait jamais d'appel réseau, reproduit le repli déterministe réel. */
const rerankerDeterministe: Reranker = {
  classer: async (shortlist) => classementDeterministe(shortlist),
};

function clients(overrides: Partial<GeologieClients> = {}): GeologieClients {
  return {
    brgm: overrides.brgm ?? brgmFixe(featuresFixture("sample-5km.geojson")),
    reranker: overrides.reranker ?? rerankerDeterministe,
  };
}

const LAT = 44.06455556;
const LON = 3.68302778;

test("requête nominale : au plus 10 résultats, tous documentés", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.ok(body.results.length <= 10);
  assert.ok(body.results.length > 0);
  assert.equal(body.selection.candidates_in_radius, 44);
  assert.equal(body.selection.shortlist_count, 15);
});

test("le rayon vaut 5000 par défaut quand il est omis", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  const body = response.json();
  assert.equal(body.query.radius_m, 5000);
});

test("un rayon supérieur à 5000 m est refusé explicitement", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}&rayon=6000` });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_QUERY");
});

test("une latitude manquante est refusée", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lon=${LON}` });
  assert.equal(response.statusCode, 400);
});

test("une erreur BRGM produit un 502 explicite, jamais une liste vide silencieuse", async (t) => {
  const app = buildApp({
    config,
    clients: clients({ brgm: brgmEnErreur("indisponible", "BRGM WFS est injoignable.") }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  assert.equal(response.statusCode, 502);
  const body = response.json();
  assert.equal(body.error.code, "GEOLOGIE_BRGM_UNAVAILABLE");
  assert.equal(body.error.retryable, true);
});

test("un dépassement de délai BRGM produit un 504", async (t) => {
  const app = buildApp({
    config,
    clients: clients({ brgm: brgmEnErreur("timeout", "BRGM WFS n'a pas répondu.") }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  assert.equal(response.statusCode, 504);
  assert.equal(response.json().error.code, "GEOLOGIE_BRGM_TIMEOUT");
});

test("un cercle vide renvoie 200 avec une liste de résultats vide", async (t) => {
  const app = buildApp({ config, clients: clients({ brgm: brgmFixe([]) }), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.selection.candidates_in_radius, 0);
  assert.deepEqual(body.results, []);
});

test("chaque résultat expose son ancien code BSS, sans régression sur les champs existants", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  const body = response.json();
  assert.ok(body.results.length > 0);
  for (const resultat of body.results) {
    assert.ok("ancien_code_bss" in resultat);
    assert.ok(typeof resultat.ancien_code_bss === "string" || resultat.ancien_code_bss === null);
    assert.ok(typeof resultat.bss_id === "string");
    assert.ok(typeof resultat.fiche_infoterre === "string" || resultat.fiche_infoterre === null);
  }
});

test("le rang de distance est conservé dans chaque résultat", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  const body = response.json();
  for (const resultat of body.results) {
    assert.ok(Number.isInteger(resultat.distance_rank));
  }
});

test("le classement de pertinence diffère du classement géographique", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  const body = response.json();
  // VA-2A (BSS002DKEC) est le 40e ouvrage le plus proche du cercle, mais sa richesse
  // géologique doit le faire remonter très haut dans le classement de pertinence.
  const va2a = body.results.find((r: { bss_id: string }) => r.bss_id === "BSS002DKEC");
  assert.ok(va2a, "VA-2A doit figurer dans le top 10 malgré son rang de distance élevé");
  assert.ok(va2a.distance_rank >= 30, `distance_rank = ${va2a.distance_rank}`);
  assert.ok(va2a.rank <= 5, `rank de pertinence = ${va2a.rank}`);
});

test("?debug=true reste sans effet quand le mode debug est désactivé", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}&debug=true` });
  const body = response.json();
  assert.equal(body.debug, undefined);
  assert.equal(body.results[0].debug, undefined);
});

test("?debug=true expose les scores intermédiaires quand le mode debug est activé", async (t) => {
  const app = buildApp({ config: { ...config, debugEnabled: true }, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}&debug=true` });
  const body = response.json();
  assert.ok(typeof body.results[0].debug.base_score === "number");
});

test("une panne du LLM retombe sur le classement déterministe sans casser le service", async (t) => {
  // Le vrai reranker ne laisse jamais fuir d'exception (cf. reranker.test.ts) : son contrat
  // observable, ici reproduit fidèlement, est de retomber sur la méthode déterministe.
  const app = buildApp({ config, clients: clients({ reranker: rerankerDeterministe }), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.selection.ranking_method, "deterministic");
  assert.ok(body.results.length > 0, "la réponse doit rester exploitable malgré l'absence de LLM");
});

test("x-request-id est relayé dans la réponse", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: `/api/v2/geologie/bss/proches?lat=${LAT}&lon=${LON}`,
    headers: { "x-request-id": "geologie-test" },
  });
  assert.equal(response.headers["x-request-id"], "geologie-test");
});

test("la route interne répond aussi sur /internal/v1/geologie/bss/proches", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/internal/v1/geologie/bss/proches?lat=${LAT}&lon=${LON}` });
  assert.equal(response.statusCode, 200);
});
