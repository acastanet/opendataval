import assert from "node:assert/strict";
import test from "node:test";
import { buildApp, type GeologieClients } from "../src/app.js";
import { ErreurInfoterre, type InfoterreClient } from "../src/clients/infoterre.js";
import type { GeologieConfig } from "../src/config.js";
import { classementDeterministe } from "../src/services/reranker.js";
import type { Reranker } from "../src/services/reranker.js";
import type { Syntheseur } from "../src/services/llm-interpretation.js";

const config: GeologieConfig = {
  host: "127.0.0.1", port: 3000, version: "test",
  brgmWfsUrl: "http://brgm.test", brgmTimeoutMs: 1000, brgmMaxFeatures: 500,
  cacheTtlSeconds: 3600, cacheMaxEntries: 10,
  llmUrl: "http://llm.test", llmModel: "test-model", llmApiKey: "cle-de-test", llmTimeoutMs: 1000, llmMaxTokens: 500,
  llmVisionModel: "test-vision-model", llmVisionTimeoutMs: 1000, llmSyntheseMaxTokens: 500,
  infoterreTimeoutMs: 1000, infoterreMaxScanBytes: 5_000_000, infoterreImageWidthPx: 1400,
  debugEnabled: false,
};

const rerankerDeterministe: Reranker = {
  classer: async (shortlist) => classementDeterministe(shortlist),
};

const HTML_MONNA_MINIMAL = `
<div id="content_document"><span>0 document(s)</span></div>
<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>1</span>
<table class="logPasses"><thead><tr><th>Profondeur</th><th>Lithologie</th><th>Stratigraphie</th></tr></thead>
<tbody><tr><td class="small">De 0 à 2,5 m<td class="big">ALLUVIONS</td><td class="small">QUATERNAIRE</td></tr></tbody>
</table></div>`;

function infoterreFixe(overrides: Partial<InfoterreClient> = {}): InfoterreClient {
  return {
    recupererFiche: async () => HTML_MONNA_MINIMAL,
    recupererScan: async () => Buffer.from(""),
    ...overrides,
  };
}

const syntheseurStructureSeule: Syntheseur = { synthetiser: async () => null };

function clients(overrides: Partial<GeologieClients> = {}): GeologieClients {
  return {
    brgm: { featuresDansBbox: async () => ({ features: [], tronque: false }) },
    reranker: rerankerDeterministe,
    infoterre: overrides.infoterre ?? infoterreFixe(),
    syntheseur: overrides.syntheseur ?? syntheseurStructureSeule,
  };
}

test("une référence invalide renvoie 400 sans appeler le client InfoTerre", async (t) => {
  let appele = false;
  const app = buildApp({
    config,
    clients: clients({ infoterre: infoterreFixe({ recupererFiche: async () => { appele = true; return ""; } }) }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/geologie/bss/synthese?reference=../../etc/passwd" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_REFERENCE");
  assert.equal(appele, false);
});

test("reference absente renvoie 400", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/v2/geologie/bss/synthese" });
  assert.equal(response.statusCode, 400);
});

test("une fiche accessible renvoie 200 avec une synthèse structure_seule quand le LLM est indisponible", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/geologie/bss/synthese?reference=09372X0012/MONNA",
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.reference, "09372X0012/MONNA");
  assert.equal(body.methode_synthese, "structure_seule");
  assert.equal(body.log_geologique.length, 1);
  assert.deepEqual(body.documents, []);
  assert.ok(body.fiche_infoterre.includes("ficheinfoterre.brgm.fr"));
});

test("une fiche InfoTerre indisponible renvoie 502 avec un code dédié", async (t) => {
  const app = buildApp({
    config,
    clients: clients({
      infoterre: infoterreFixe({
        recupererFiche: async () => { throw new ErreurInfoterre("indisponible", "InfoTerre est injoignable."); },
      }),
    }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/geologie/bss/synthese?reference=09372X0012/MONNA",
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, "GEOLOGIE_INFOTERRE_UNAVAILABLE");
});

test("un dépassement de délai InfoTerre renvoie 504", async (t) => {
  const app = buildApp({
    config,
    clients: clients({
      infoterre: infoterreFixe({
        recupererFiche: async () => { throw new ErreurInfoterre("timeout", "InfoTerre n'a pas répondu."); },
      }),
    }),
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/geologie/bss/synthese?reference=09372X0012/MONNA",
  });
  assert.equal(response.statusCode, 504);
  assert.equal(response.json().error.code, "GEOLOGIE_INFOTERRE_TIMEOUT");
});

test("la route /bss/proches reste fonctionnelle sans fournir infoterre ni syntheseur explicitement", async (t) => {
  const app = buildApp({
    config,
    clients: { brgm: { featuresDansBbox: async () => ({ features: [], tronque: false }) }, reranker: rerankerDeterministe },
    logger: false,
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/api/v2/geologie/bss/proches?lat=44.06455556&lon=3.68302778",
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().results, []);
});

test("la route interne /internal/v1/geologie/bss/synthese répond de la même façon", async (t) => {
  const app = buildApp({ config, clients: clients(), logger: false });
  t.after(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/internal/v1/geologie/bss/synthese?reference=09372X0012/MONNA",
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().methode_synthese, "structure_seule");
});
