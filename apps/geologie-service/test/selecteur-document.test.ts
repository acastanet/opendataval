import assert from "node:assert/strict";
import test from "node:test";
import type { GeologieConfig } from "../src/config.js";
import type { DocumentInfoterre } from "../src/domain/infoterre-parsing.js";
import { createSelecteurDocument } from "../src/services/selecteur-document.js";

function config(overrides: Partial<GeologieConfig> = {}): GeologieConfig {
  return {
    host: "127.0.0.1", port: 3000, version: "test",
    brgmWfsUrl: "http://brgm.test", brgmTimeoutMs: 1000, brgmMaxFeatures: 500,
    cacheTtlSeconds: 3600, cacheMaxEntries: 10,
    llmUrl: "http://llm.test/v1/chat/completions", llmModel: "mistral-medium-latest",
    llmApiKey: "cle-de-test", llmTimeoutMs: 1000, llmMaxTokens: 1500,
    llmVisionModel: "mistral-medium-latest", llmVisionTimeoutMs: 1000, llmSyntheseMaxTokens: 700,
    infoterreTimeoutMs: 1000, infoterreMaxScanBytes: 5_000_000, infoterreImageWidthPx: 1400,
    debugEnabled: false,
    ...overrides,
  };
}

function document(overrides: Partial<DocumentInfoterre> = {}): DocumentInfoterre {
  return { nom: "doc.tif", types: ["COUPE GEOLOGIQUE DE CHANTIER"], url_scan: "http://x/doc.tif", ...overrides };
}

function reponseChat(contenu: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: contenu } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("aucun document ne renvoie une sélection vide, sans appel réseau", async () => {
  let appele = false;
  const fetchImpl = (async () => { appele = true; return reponseChat("{}"); }) as typeof fetch;
  const selecteur = createSelecteurDocument(config(), fetchImpl);
  const resultat = await selecteur.selectionner([]);
  assert.deepEqual(resultat, { document: null, raison: null, methode: "aucune" });
  assert.equal(appele, false);
});

test("un seul document est sélectionné directement, sans appel réseau", async () => {
  let appele = false;
  const fetchImpl = (async () => { appele = true; return reponseChat("{}"); }) as typeof fetch;
  const unique = document({ nom: "seul.pdf" });
  const selecteur = createSelecteurDocument(config(), fetchImpl);
  const resultat = await selecteur.selectionner([unique]);
  assert.equal(resultat.methode, "unique");
  assert.equal(resultat.document?.nom, "seul.pdf");
  assert.equal(appele, false);
});

test("sans clé API, plusieurs documents déclenchent le repli déterministe sans appel réseau", async () => {
  let appele = false;
  const fetchImpl = (async () => { appele = true; return reponseChat("{}"); }) as typeof fetch;
  const documents = [document({ nom: "autre.pdf", types: ["AUTRE"] }), document({ nom: "coupe.tif", types: ["COUPE GEOLOGIQUE INTERPRETEE"] })];
  const selecteur = createSelecteurDocument(config({ llmApiKey: "" }), fetchImpl);
  const resultat = await selecteur.selectionner(documents);
  assert.equal(resultat.methode, "deterministe");
  assert.equal(resultat.document?.nom, "coupe.tif");
  assert.equal(appele, false);
});

test("une sortie LLM valide désigne le document choisi", async () => {
  const documents = [document({ nom: "a.pdf" }), document({ nom: "b.tif" })];
  const fetchImpl = (async () => reponseChat(JSON.stringify({ document: "b.tif", reason: "coupe la plus lisible" }))) as typeof fetch;
  const selecteur = createSelecteurDocument(config(), fetchImpl);
  const resultat = await selecteur.selectionner(documents);
  assert.equal(resultat.methode, "llm");
  assert.equal(resultat.document?.nom, "b.tif");
  assert.equal(resultat.raison, "coupe la plus lisible");
});

test("un nom halluciné (hors liste) déclenche le repli déterministe", async () => {
  const documents = [document({ nom: "a.pdf", types: ["AUTRE"] }), document({ nom: "b.tif", types: ["COUPE GEOLOGIQUE INTERPRETEE"] })];
  const fetchImpl = (async () => reponseChat(JSON.stringify({ document: "inexistant.tif", reason: "x" }))) as typeof fetch;
  const selecteur = createSelecteurDocument(config(), fetchImpl);
  const resultat = await selecteur.selectionner(documents);
  assert.equal(resultat.methode, "deterministe");
  assert.equal(resultat.document?.nom, "b.tif");
});

test("une réponse LLM non-JSON déclenche le repli déterministe", async () => {
  const documents = [document({ nom: "a.pdf" }), document({ nom: "b.tif" })];
  const fetchImpl = (async () => reponseChat("je ne sais pas répondre en JSON")) as typeof fetch;
  const selecteur = createSelecteurDocument(config(), fetchImpl);
  const resultat = await selecteur.selectionner(documents);
  assert.equal(resultat.methode, "deterministe");
});

test("une erreur HTTP du LLM déclenche le repli déterministe", async () => {
  const documents = [document({ nom: "a.pdf" }), document({ nom: "b.tif" })];
  const fetchImpl = (async () => new Response("erreur", { status: 500 })) as typeof fetch;
  const selecteur = createSelecteurDocument(config(), fetchImpl);
  const resultat = await selecteur.selectionner(documents);
  assert.equal(resultat.methode, "deterministe");
});

test("un timeout du LLM déclenche le repli déterministe sans exception", async () => {
  const documents = [document({ nom: "a.pdf" }), document({ nom: "b.tif" })];
  const fetchImpl = (async () => { throw new DOMException("Le délai est dépassé.", "TimeoutError"); }) as typeof fetch;
  const selecteur = createSelecteurDocument(config(), fetchImpl);
  const resultat = await selecteur.selectionner(documents);
  assert.equal(resultat.methode, "deterministe");
});
