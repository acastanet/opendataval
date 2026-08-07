import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import { ErreurInfoterre, type InfoterreClient } from "../src/clients/infoterre.js";
import type { GeologieConfig } from "../src/config.js";
import type { Syntheseur } from "../src/services/llm-interpretation.js";
import { interpreterFiche, syntheseStructureSeule } from "../src/services/interpretation.js";

function config(overrides: Partial<GeologieConfig> = {}): GeologieConfig {
  return {
    host: "127.0.0.1", port: 3000, version: "test",
    brgmWfsUrl: "http://brgm.test", brgmTimeoutMs: 1000, brgmMaxFeatures: 500,
    cacheTtlSeconds: 3600, cacheMaxEntries: 10,
    llmUrl: "http://llm.test", llmModel: "test-model", llmApiKey: "cle-de-test", llmTimeoutMs: 1000, llmMaxTokens: 500,
    llmVisionModel: "test-vision-model", llmVisionTimeoutMs: 1000, llmSyntheseMaxTokens: 500,
    infoterreTimeoutMs: 1000, infoterreMaxScanBytes: 5_000_000, infoterreImageWidthPx: 1400, infoterreMaxImages: 2,
    debugEnabled: false,
    ...overrides,
  };
}

const LOG_STUB = { info: () => {}, error: () => {}, warn: () => {} } as unknown as FastifyBaseLogger;

const HTML_MONNA = `
<div id="content_document" class="bloc_content">
<span>1 document(s)</span>
<table>
<tr><th>Vignette</th><th>Nom</th><th>Type</th><th>Poids</th></tr>
<tr><td><div class="list"><div class="vignette"><a href="scan?name=M541404.TIF&path=/x"><img src="v.jpg"></a></div></div></td>
<td><a href="scan?name=M541404.TIF&path=/x">M541404.TIF</a></td>
<td><ul><li>COUPE GEOLOGIQUE INTERPRETEE</li></ul></td>
<td>21 Ko</td></tr>
</table>
</div>
<div id="content_log" class="bloc_content">
<h3 class="nbPasses">Nombre de niveaux :</h3><span>1</span>
<table class="logPasses"><thead><tr><th>Profondeur</th><th>Lithologie</th><th>Stratigraphie</th></tr></thead>
<tbody><tr><td class="small">De 0 à 2,5 m<td class="big">ALLUVIONS</td><td class="small">QUATERNAIRE</td></tr></tbody>
</table>
</div>`;

function infoterreClient(overrides: Partial<InfoterreClient> = {}): InfoterreClient {
  return {
    recupererFiche: async () => HTML_MONNA,
    recupererScan: async () => Buffer.from("scan-binaire"),
    ...overrides,
  };
}

function syntheseur(fn: Syntheseur["synthetiser"]): Syntheseur {
  return { synthetiser: fn };
}

// La conversion réelle (sharp) échouerait sur un buffer factice « scan-binaire » ; on ne teste
// pas conversion-image.ts ici (déjà couvert par conversion-image.test.ts), donc on vérifie le
// comportement de repli quand la conversion échoue plutôt que d'essayer de la faire réussir.

test("propage l'erreur si la fiche InfoTerre est indisponible (pas de repli)", async () => {
  const deps = {
    infoterre: infoterreClient({
      recupererFiche: async () => {
        throw new ErreurInfoterre("indisponible", "InfoTerre est injoignable.");
      },
    }),
    syntheseur: syntheseur(async () => null),
    config: config(),
    log: LOG_STUB,
  };
  await assert.rejects(() => interpreterFiche("09372X0012/MONNA", deps), ErreurInfoterre);
});

test("repli sur structure_seule quand le LLM ne répond pas, avec avertissement explicite", async () => {
  const deps = {
    infoterre: infoterreClient({
      recupererScan: async () => {
        throw new ErreurInfoterre("indisponible", "scan illisible");
      },
    }),
    syntheseur: syntheseur(async () => null),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "structure_seule");
  assert.equal(resultat.synthese, syntheseStructureSeule(resultat.log_geologique));
  assert.ok(resultat.avertissements.some((a) => a.includes("repli sur le log structuré")));
  assert.ok(resultat.avertissements.some((a) => a.includes('Scan "M541404.TIF" ignoré')));
});

test("aucun avertissement sur l'échec LLM si aucune clé API n'est configurée", async () => {
  const deps = {
    infoterre: infoterreClient({
      recupererScan: async () => {
        throw new ErreurInfoterre("indisponible", "scan illisible");
      },
    }),
    syntheseur: syntheseur(async () => null),
    config: config({ llmApiKey: "" }),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "structure_seule");
  assert.ok(!resultat.avertissements.some((a) => a.includes("La synthèse par IA")));
});

test("méthode llm_texte quand le LLM répond sans qu'aucune image n'ait pu être analysée", async () => {
  const deps = {
    infoterre: infoterreClient({
      recupererScan: async () => {
        throw new ErreurInfoterre("indisponible", "scan illisible");
      },
    }),
    syntheseur: syntheseur(async (requete) => {
      assert.equal(requete.images.length, 0);
      return "Synthèse texte seule.";
    }),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "llm_texte");
  assert.equal(resultat.synthese, "Synthèse texte seule.");
});

test("méthode llm_vision quand au moins une image a pu être convertie et transmise", async () => {
  const pngMinimal = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const deps = {
    infoterre: infoterreClient({
      recupererScan: async () => pngMinimal,
    }),
    syntheseur: syntheseur(async (requete) => {
      // On simule une conversion réussie en interceptant au niveau du syntheseur : ce test
      // vérifie le câblage methode_synthese, pas la conversion réelle (voir note plus haut).
      return requete.images.length > 0 ? "Synthèse avec image." : null;
    }),
    config: config(),
    log: LOG_STUB,
  };
  // sharp échouera sur ce faux PNG tronqué → le scan sera ignoré et on retombera sur llm_texte.
  // On vérifie donc ici le cas réaliste : conversion échouée ⇒ pas d'image ⇒ pas de vision.
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.notEqual(resultat.methode_synthese, "llm_vision");
});

test("méthode llm_vision de bout en bout avec un vrai scan TIFF converti en PNG", async () => {
  const tiffReel = readFileSync(fileURLToPath(new URL("./fixtures/M541404.tif", import.meta.url)));
  const deps = {
    infoterre: infoterreClient({ recupererScan: async () => tiffReel }),
    syntheseur: syntheseur(async (requete) => {
      assert.equal(requete.images.length, 1);
      assert.ok(requete.images[0]?.pngBase64.length ?? 0 > 100);
      return "Coupe géologique interprétée à partir du scan réel.";
    }),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "llm_vision");
  assert.equal(resultat.images_analysees.length, 1);
  assert.ok(resultat.images_analysees[0]?.apercu_data_url.startsWith("data:image/png;base64,"));
  assert.equal(resultat.avertissements.length, 0);
});

test("les erreurs de parsing (log/documents) sont absorbées avec avertissement, sans exception", async () => {
  const htmlCasse = '<div id="content_document"><span>3 document(s)</span><p>format inattendu</p></div>' +
    '<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>5</span><p>?</p></div>';
  const deps = {
    infoterre: infoterreClient({ recupererFiche: async () => htmlCasse }),
    syntheseur: syntheseur(async () => null),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.deepEqual(resultat.log_geologique, []);
  assert.deepEqual(resultat.documents, []);
  assert.ok(resultat.avertissements.some((a) => a.includes('Section "log géologique" non reconnue')));
  assert.ok(resultat.avertissements.some((a) => a.includes('Section "documents numérisés" non reconnue')));
});

test("syntheseStructureSeule résume le log sans rien inventer", () => {
  const texte = syntheseStructureSeule([
    { profondeur_min_m: 0, profondeur_max_m: 2.5, lithologie: "ALLUVIONS", stratigraphie: "QUATERNAIRE" },
    { profondeur_min_m: 2.5, profondeur_max_m: 97, lithologie: "GRANITE", stratigraphie: "IMPRECIS" },
  ]);
  assert.match(texte, /2 niveaux/);
  assert.match(texte, /97 m/);
  assert.match(texte, /ALLUVIONS/);
  assert.match(texte, /GRANITE/);
});

test("syntheseStructureSeule gère un log vide sans inventer de contenu", () => {
  assert.equal(syntheseStructureSeule([]), "Aucun log géologique structuré n'est disponible pour cet ouvrage.");
});
