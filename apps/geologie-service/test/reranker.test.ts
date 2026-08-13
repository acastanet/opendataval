import assert from "node:assert/strict";
import test from "node:test";
import type { GeologieConfig } from "../src/config.js";
import { classementDeterministe, classementParDistance, createReranker, extraireJson, validerSortieLlm } from "../src/services/reranker.js";
import type { Candidat, OuvrageBss } from "../src/types.js";

function candidat(overrides: Partial<Candidat> = {}): Candidat {
  const base: OuvrageBss = {
    bss_id: "TEST", ancien_code_bss: null, designation: null, nature_brgm: null,
    distance_m: 1000, x_l93: 0, y_l93: 0, profondeur_m: null, altitude_m: null,
    mode_execution: null, commune_bss: null, lieu_dit: null, longitude: null, latitude: null,
    is_borehole: false, is_sounding: false, is_core_sample: false,
    has_geological_section: false, has_geological_section_document: false, has_geological_section_scan: false,
    documents: [], fiche_infoterre: null,
  };
  return { ...base, distance_rank: 0, geological_value_score: 0, proximity_score: 0, base_score: 0, ...overrides };
}

function config(overrides: Partial<GeologieConfig> = {}): GeologieConfig {
  return {
    host: "127.0.0.1", port: 3000, version: "test",
    brgmWfsUrl: "http://brgm.test", brgmTimeoutMs: 1000, brgmMaxFeatures: 500,
    cacheTtlSeconds: 3600, cacheMaxEntries: 10,
    llmUrl: "http://llm.test/v1/chat/completions", llmModel: "mistral-medium-latest",
    llmApiKey: "cle-de-test", llmTimeoutMs: 1000, llmMaxTokens: 1500,
    llmVisionModel: "mistral-medium-latest", llmVisionTimeoutMs: 1000, llmSyntheseMaxTokens: 700,
    infoterreTimeoutMs: 1000, infoterreMaxScanBytes: 5_000_000, infoterreImageWidthPx: 1400, infoterreMaxImages: 2,
    debugEnabled: false,
    ...overrides,
  };
}

function reponseChat(contenu: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: contenu } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("extrait un JSON entouré de balises ```json", () => {
  const texte = "Voici le résultat :\n```json\n{\"ranking\":[{\"bss_id\":\"A\",\"rank\":1,\"score\":90,\"reason\":\"ok\"}]}\n```\nFin.";
  const extrait = extraireJson(texte) as { ranking: unknown[] };
  assert.equal(extrait.ranking.length, 1);
});

test("extrait un JSON brut sans balises", () => {
  const texte = '{"ranking":[]}';
  assert.deepEqual(extraireJson(texte), { ranking: [] });
});

test("renvoie null si aucun JSON n'est présent", () => {
  assert.equal(extraireJson("désolé, je ne peux pas répondre"), null);
});

test("accepte une sortie LLM valide", () => {
  const autorises = new Set(["A", "B"]);
  const entrees = validerSortieLlm({ ranking: [{ bss_id: "A", rank: 1, score: 90, reason: "bon carottage" }] }, autorises);
  assert.equal(entrees?.length, 1);
  assert.equal(entrees?.[0]?.bss_id, "A");
});

test("ignore un identifiant hors shortlist", () => {
  const autorises = new Set(["A"]);
  const entrees = validerSortieLlm({ ranking: [{ bss_id: "HORS-LISTE", rank: 1, score: 90, reason: "x" }] }, autorises);
  assert.equal(entrees, null);
});

test("rejette un doublon de bss_id", () => {
  const autorises = new Set(["A"]);
  const entrees = validerSortieLlm({
    ranking: [
      { bss_id: "A", rank: 1, score: 90, reason: "x" },
      { bss_id: "A", rank: 2, score: 80, reason: "y" },
    ],
  }, autorises);
  assert.equal(entrees?.length, 1, "le doublon doit être ignoré, pas la première occurrence");
});

test("rejette un rang dupliqué", () => {
  const autorises = new Set(["A", "B"]);
  const entrees = validerSortieLlm({
    ranking: [
      { bss_id: "A", rank: 1, score: 90, reason: "x" },
      { bss_id: "B", rank: 1, score: 80, reason: "y" },
    ],
  }, autorises);
  assert.equal(entrees?.length, 1);
});

test("rejette un score hors bornes", () => {
  const autorises = new Set(["A"]);
  const entrees = validerSortieLlm({ ranking: [{ bss_id: "A", rank: 1, score: 150, reason: "x" }] }, autorises);
  assert.equal(entrees, null);
});

test("tronque au-delà de 10 entrées", () => {
  const autorises = new Set(Array.from({ length: 12 }, (_, i) => `ID-${i}`));
  const ranking = Array.from({ length: 12 }, (_, i) => ({ bss_id: `ID-${i}`, rank: i + 1, score: 50, reason: null }));
  const entrees = validerSortieLlm({ ranking }, autorises);
  assert.equal(entrees?.length, 10);
});

test("classement déterministe : top 10 dans l'ordre de la shortlist, sans justification", () => {
  const shortlist = Array.from({ length: 12 }, (_, i) => candidat({ bss_id: `ID-${i}`, base_score: 100 - i }));
  const classement = classementDeterministe(shortlist);
  assert.equal(classement.methode, "deterministic");
  assert.equal(classement.entrees.length, 10);
  assert.equal(classement.entrees[0]?.bss_id, "ID-0");
  assert.equal(classement.entrees[0]?.reason, null);
});

test("classement par distance : aucune troncature, ordre géographique conservé", () => {
  const candidats = Array.from({ length: 12 }, (_, i) => candidat({ bss_id: `ID-${i}`, distance_rank: i, base_score: i }));
  const classement = classementParDistance(candidats);
  assert.equal(classement.methode, "distance");
  assert.equal(classement.entrees.length, 12);
  assert.equal(classement.entrees[0]?.bss_id, "ID-0");
  assert.equal(classement.entrees[0]?.rank, 1);
  assert.equal(classement.entrees[11]?.rank, 12);
  assert.ok(classement.entrees.every((entree) => entree.reason === null));
});

test("sans clé API, le reranker part directement en fallback sans appel réseau", async () => {
  let appele = false;
  const fetchImpl = (async () => { appele = true; return reponseChat("{}"); }) as typeof fetch;
  const reranker = createReranker(config({ llmApiKey: "" }), fetchImpl);
  const resultat = await reranker.classer([candidat({ bss_id: "A", base_score: 50 })]);
  assert.equal(resultat.methode, "deterministic");
  assert.equal(appele, false);
});

test("une shortlist vide ne déclenche aucun appel LLM", async () => {
  let appele = false;
  const fetchImpl = (async () => { appele = true; return reponseChat("{}"); }) as typeof fetch;
  const reranker = createReranker(config(), fetchImpl);
  const resultat = await reranker.classer([]);
  assert.equal(resultat.methode, "deterministic");
  assert.equal(resultat.entrees.length, 0);
  assert.equal(appele, false);
});

test("une sortie LLM valide est acceptée et retournée telle quelle", async () => {
  const fetchImpl = (async () => reponseChat(JSON.stringify({
    ranking: [{ bss_id: "A", rank: 1, score: 95, reason: "carottage riche" }],
  }))) as typeof fetch;
  const reranker = createReranker(config(), fetchImpl);
  const resultat = await reranker.classer([candidat({ bss_id: "A", base_score: 50 })]);
  assert.equal(resultat.methode, "llm_reranked");
  assert.equal(resultat.entrees[0]?.bss_id, "A");
});

test("une réponse LLM non-JSON déclenche le fallback déterministe", async () => {
  const fetchImpl = (async () => reponseChat("je ne sais pas répondre en JSON")) as typeof fetch;
  const reranker = createReranker(config(), fetchImpl);
  const resultat = await reranker.classer([candidat({ bss_id: "A", base_score: 50 })]);
  assert.equal(resultat.methode, "deterministic");
});

test("une erreur HTTP du LLM déclenche le fallback déterministe", async () => {
  const fetchImpl = (async () => new Response("erreur", { status: 500 })) as typeof fetch;
  const reranker = createReranker(config(), fetchImpl);
  const resultat = await reranker.classer([candidat({ bss_id: "A", base_score: 50 })]);
  assert.equal(resultat.methode, "deterministic");
});

test("un timeout du LLM déclenche le fallback déterministe sans exception", async () => {
  const fetchImpl = (async () => { throw new DOMException("Le délai est dépassé.", "TimeoutError"); }) as typeof fetch;
  const reranker = createReranker(config(), fetchImpl);
  const resultat = await reranker.classer([candidat({ bss_id: "A", base_score: 50 })]);
  assert.equal(resultat.methode, "deterministic");
});

test("un seul appel réseau est effectué, quelle que soit la taille de la shortlist", async () => {
  let appels = 0;
  const fetchImpl = (async () => {
    appels++;
    return reponseChat(JSON.stringify({ ranking: [{ bss_id: "ID-0", rank: 1, score: 90, reason: "x" }] }));
  }) as typeof fetch;
  const reranker = createReranker(config(), fetchImpl);
  const shortlist = Array.from({ length: 15 }, (_, i) => candidat({ bss_id: `ID-${i}`, base_score: 100 - i }));
  await reranker.classer(shortlist);
  assert.equal(appels, 1);
});
