import assert from "node:assert/strict";
import test from "node:test";
import type { GeologieConfig } from "../src/config.js";
import { createSyntheseurLlm } from "../src/services/llm-interpretation.js";

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

const REQUETE_SANS_IMAGE = { reference: "09372X0012/MONNA", log: [], images: [] };

test("retourne null immédiatement si aucune clé API n'est configurée, sans appel réseau", async () => {
  let appele = false;
  const fetchImpl = (async () => {
    appele = true;
    return reponseChat("synthèse");
  }) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config({ llmApiKey: "" }), fetchImpl);
  const resultat = await syntheseur.synthetiser(REQUETE_SANS_IMAGE);
  assert.equal(resultat, null);
  assert.equal(appele, false);
});

test("retourne la synthèse texte quand le LLM répond correctement, sans image", async () => {
  const fetchImpl = (async () => reponseChat("Log sur 3 niveaux, alluvions puis granite.")) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  const resultat = await syntheseur.synthetiser(REQUETE_SANS_IMAGE);
  assert.equal(resultat, "Log sur 3 niveaux, alluvions puis granite.");
});

test("envoie les images en content parts image_url, sans dépasser le nombre fourni", async () => {
  let corpsRequete: { messages: { role: string; content: unknown }[] } | undefined;
  const fetchImpl = (async (_url, init) => {
    corpsRequete = JSON.parse(String((init as RequestInit).body));
    return reponseChat("synthèse avec image");
  }) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  await syntheseur.synthetiser({
    reference: "09372X0012/MONNA",
    log: [],
    images: [
      { nom: "A.TIF", types: ["COUPE GEOLOGIQUE INTERPRETEE"], pngBase64: "AAAA" },
      { nom: "B.TIF", types: ["COUPE GEOLOGIQUE DE CHANTIER"], pngBase64: "BBBB" },
    ],
  });

  const contenuUser = corpsRequete?.messages.find((m) => m.role === "user")?.content as unknown[];
  assert.equal(contenuUser.length, 3, "1 partie texte + 2 parties image_url");
  const parties = contenuUser as { type: string; image_url?: { url: string } }[];
  assert.equal(parties[0]?.type, "text");
  assert.equal(parties[1]?.type, "image_url");
  assert.ok(parties[1]?.image_url?.url.startsWith("data:image/png;base64,AAAA"));
  assert.equal(parties[2]?.type, "image_url");
});

test("un seul appel réseau est effectué, quel que soit le nombre d'images", async () => {
  let appels = 0;
  const fetchImpl = (async () => {
    appels += 1;
    return reponseChat("synthèse");
  }) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  await syntheseur.synthetiser({
    reference: "09372X0012/MONNA",
    log: [],
    images: [
      { nom: "A.TIF", types: [], pngBase64: "AAAA" },
      { nom: "B.TIF", types: [], pngBase64: "BBBB" },
    ],
  });
  assert.equal(appels, 1);
});

test("retourne null si le LLM répond en erreur HTTP", async () => {
  const fetchImpl = (async () => new Response("erreur", { status: 500 })) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  assert.equal(await syntheseur.synthetiser(REQUETE_SANS_IMAGE), null);
});

test("retourne null si la réponse est un JSON invalide", async () => {
  const fetchImpl = (async () => new Response("pas du json", { status: 200 })) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  assert.equal(await syntheseur.synthetiser(REQUETE_SANS_IMAGE), null);
});

test("retourne null si la réponse est vide", async () => {
  const fetchImpl = (async () => reponseChat("   ")) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  assert.equal(await syntheseur.synthetiser(REQUETE_SANS_IMAGE), null);
});

test("retourne null si la réponse dépasse 4000 caractères", async () => {
  const fetchImpl = (async () => reponseChat("a".repeat(4001))) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  assert.equal(await syntheseur.synthetiser(REQUETE_SANS_IMAGE), null);
});

test("retourne null sans exception si le fetch expire", async () => {
  const fetchImpl = (async () => {
    const err = new Error("expiré");
    err.name = "TimeoutError";
    throw err;
  }) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  await assert.doesNotReject(async () => {
    assert.equal(await syntheseur.synthetiser(REQUETE_SANS_IMAGE), null);
  });
});

test("aucune fuite du contenu base64 des images dans le corps envoyé côté texte", async () => {
  // Garde-fou anti-fuite : le texte JSON envoyé au LLM ne doit contenir que la référence et
  // le log, jamais le base64 des images (qui doit uniquement apparaître dans les parties image_url).
  let corpsRequete: { messages: { role: string; content: unknown }[] } | undefined;
  const fetchImpl = (async (_url, init) => {
    corpsRequete = JSON.parse(String((init as RequestInit).body));
    return reponseChat("synthèse");
  }) as unknown as typeof fetch;
  const syntheseur = createSyntheseurLlm(config(), fetchImpl);
  await syntheseur.synthetiser({
    reference: "09372X0012/MONNA",
    log: [],
    images: [{ nom: "A.TIF", types: [], pngBase64: "SECRET_BASE64_PAYLOAD" }],
  });

  const contenuUser = corpsRequete?.messages.find((m) => m.role === "user")?.content as { type: string; text?: string }[];
  const partieTexte = contenuUser.find((p) => p.type === "text");
  assert.ok(!partieTexte?.text?.includes("SECRET_BASE64_PAYLOAD"), "le base64 ne doit apparaître que dans image_url");
});
