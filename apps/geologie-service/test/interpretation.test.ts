import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import { ErreurInfoterre, type InfoterreClient } from "../src/clients/infoterre.js";
import type { GeologieConfig } from "../src/config.js";
import { createConvertisseur, type Convertisseur, type DocumentConverti } from "../src/services/conversion-document.js";
import type { Syntheseur } from "../src/services/llm-interpretation.js";
import { interpreterFiche, syntheseStructureSeule } from "../src/services/interpretation.js";
import type { SelecteurDocument } from "../src/services/selecteur-document.js";

function config(overrides: Partial<GeologieConfig> = {}): GeologieConfig {
  return {
    host: "127.0.0.1", port: 3000, version: "test",
    brgmWfsUrl: "http://brgm.test", brgmTimeoutMs: 1000, brgmMaxFeatures: 500,
    cacheTtlSeconds: 3600, cacheMaxEntries: 10,
    llmUrl: "http://llm.test", llmModel: "test-model", llmApiKey: "cle-de-test", llmTimeoutMs: 1000, llmMaxTokens: 500,
    llmVisionModel: "test-vision-model", llmVisionTimeoutMs: 1000, llmSyntheseMaxTokens: 500,
    infoterreTimeoutMs: 1000, infoterreMaxScanBytes: 5_000_000, infoterreImageWidthPx: 1400,
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

/** Sélectionne toujours le premier document (ou aucun si la fiche n'en propose pas), sans appel réseau. */
function selecteurPremierDocument(): SelecteurDocument {
  return {
    async selectionner(documents) {
      if (documents.length === 0) return { document: null, raison: null, methode: "aucune" };
      return { document: documents[0], raison: null, methode: documents.length === 1 ? "unique" : "deterministe" };
    },
  };
}

function selecteurFixe(resultat: Awaited<ReturnType<SelecteurDocument["selectionner"]>>): SelecteurDocument {
  return { selectionner: async () => resultat };
}

function convertisseurQuiEchoue(message = "conversion impossible"): Convertisseur {
  return { convertir: async () => { throw new Error(message); } };
}

function convertisseurFixe(contenu: DocumentConverti): Convertisseur {
  return { convertir: async () => contenu };
}

test("propage l'erreur si la fiche InfoTerre est indisponible (pas de repli)", async () => {
  const deps = {
    infoterre: infoterreClient({
      recupererFiche: async () => {
        throw new ErreurInfoterre("indisponible", "InfoTerre est injoignable.");
      },
    }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue(),
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
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue(),
    syntheseur: syntheseur(async () => null),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "structure_seule");
  assert.equal(resultat.synthese, syntheseStructureSeule(resultat.log_geologique));
  assert.ok(resultat.avertissements.some((a) => a.includes("repli sur le log structuré")));
  assert.ok(resultat.avertissements.some((a) => a.includes('Document "M541404.TIF" ignoré')));
});

test("aucun avertissement sur l'échec LLM si aucune clé API n'est configurée", async () => {
  const deps = {
    infoterre: infoterreClient({
      recupererScan: async () => {
        throw new ErreurInfoterre("indisponible", "scan illisible");
      },
    }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue(),
    syntheseur: syntheseur(async () => null),
    config: config({ llmApiKey: "" }),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "structure_seule");
  assert.ok(!resultat.avertissements.some((a) => a.includes("La synthèse par IA")));
});

test("méthode llm_texte quand le LLM répond sans qu'aucun document n'ait pu être analysé", async () => {
  const deps = {
    infoterre: infoterreClient({
      recupererScan: async () => {
        throw new ErreurInfoterre("indisponible", "scan illisible");
      },
    }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue(),
    syntheseur: syntheseur(async (requete) => {
      assert.equal(requete.document, undefined);
      return "Synthèse texte seule.";
    }),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "llm_texte");
  assert.equal(resultat.synthese, "Synthèse texte seule.");
});

test("conversion du document sélectionné échouée : pas de vision, repli llm_texte avec avertissement", async () => {
  const deps = {
    infoterre: infoterreClient({ recupererScan: async () => Buffer.from("scan-quelconque") }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue("format non décodable"),
    syntheseur: syntheseur(async (requete) => (requete.document ? null : "Synthèse texte seule.")),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "llm_texte");
  assert.ok(resultat.avertissements.some((a) => a.includes('Document "M541404.TIF" ignoré')));
});

test("méthode llm_vision de bout en bout avec un vrai scan TIFF converti en PNG", async () => {
  const tiffReel = readFileSync(fileURLToPath(new URL("./fixtures/M541404.tif", import.meta.url)));
  const deps = {
    infoterre: infoterreClient({ recupererScan: async () => tiffReel }),
    selecteur: selecteurPremierDocument(),
    convertisseur: createConvertisseur(1400),
    syntheseur: syntheseur(async (requete) => {
      assert.equal(requete.document?.contenu.type, "image");
      assert.ok(requete.document?.contenu.type === "image" && requete.document.contenu.pngBase64.length > 100);
      return "Coupe géologique interprétée à partir du scan réel.";
    }),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0012/MONNA", deps);
  assert.equal(resultat.methode_synthese, "llm_vision");
  assert.equal(resultat.images_analysees.length, 1);
  assert.ok(resultat.images_analysees[0]?.apercu_data_url.startsWith("data:image/png;base64,"));
  assert.equal(resultat.document_selectionne?.nom, "M541404.TIF");
  assert.equal(resultat.document_selectionne?.methode_selection, "unique");
  assert.equal(resultat.avertissements.length, 0);
});

test("méthode llm_document_texte quand le texte extrait d'un PDF sélectionné est exploitable", async () => {
  const htmlRapportPdf = `<div id="content_document" class="bloc_content">
<span>1 document(s)</span>
<table>
<tr><th>Vignette</th><th>Nom</th><th>Type</th><th>Poids</th></tr>
<tr><td><div class="list"><div class="vignette"><a href="scan?name=RAPPORT.PDF&path=/x"><img src="v.jpg"></a></div></div></td>
<td><a href="scan?name=RAPPORT.PDF&path=/x">RAPPORT.PDF</a></td>
<td><ul><li>RAPPORT DE FIN DE SONDAGE</li></ul></td>
<td>500 Ko</td></tr>
</table>
</div>
<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>0</span></div>`;
  const deps = {
    infoterre: infoterreClient({ recupererFiche: async () => htmlRapportPdf, recupererScan: async () => Buffer.from("pdf-quelconque") }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurFixe({ type: "texte", texte: "Argile puis granite d'après le rapport." }),
    syntheseur: syntheseur(async (requete) => {
      assert.equal(requete.document?.contenu.type, "texte");
      return "Synthèse à partir du rapport PDF.";
    }),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0004/AURIOL", deps);
  assert.equal(resultat.methode_synthese, "llm_document_texte");
  assert.equal(resultat.images_analysees.length, 0);
  assert.equal(resultat.document_texte_analyse?.nom, "RAPPORT.PDF");
  assert.ok(resultat.document_texte_analyse?.extrait.includes("Argile puis granite"));
});

test("les erreurs de parsing (log/documents) sont absorbées avec avertissement, sans exception", async () => {
  const htmlCasse = '<div id="content_document"><span>3 document(s)</span><p>format inattendu</p></div>' +
    '<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>5</span><p>?</p></div>';
  const deps = {
    infoterre: infoterreClient({ recupererFiche: async () => htmlCasse }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue(),
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

test("aucun log ni scan analysable : le LLM n'est pas appelé, avertissement explicite", async () => {
  const htmlVide = '<div id="content_document"><span>0 document(s)</span></div>' +
    '<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>0</span></div>';
  let appele = false;
  const deps = {
    infoterre: infoterreClient({ recupererFiche: async () => htmlVide }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue(),
    syntheseur: syntheseur(async () => { appele = true; return "ne devrait jamais être renvoyé"; }),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0004/AURIOL", deps);
  assert.equal(appele, false, "le LLM ne doit pas être appelé sans log ni document à lui transmettre");
  assert.equal(resultat.methode_synthese, "structure_seule");
  assert.equal(resultat.synthese, syntheseStructureSeule([]));
  assert.ok(resultat.avertissements.some((a) => a.includes("consultez la fiche InfoTerre directement")));
});

test("document sélectionné mais dont la conversion échoue : repli structure_seule avec avertissement dédié", async () => {
  const htmlUnDocument = `<div id="content_document" class="bloc_content">
<span>1 document(s)</span>
<table>
<tr><th>Vignette</th><th>Nom</th><th>Type</th><th>Poids</th></tr>
<tr><td><div class="list"><div class="vignette"><a href="scan?name=RAPPORT.PDF&path=/x"><img src="v.jpg"></a></div></div></td>
<td><a href="scan?name=RAPPORT.PDF&path=/x">RAPPORT.PDF</a></td>
<td><ul><li>RAPPORT DE FIN DE SONDAGE</li></ul></td>
<td>500 Ko</td></tr>
</table>
</div>
<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>0</span></div>`;
  let appele = false;
  const deps = {
    infoterre: infoterreClient({ recupererFiche: async () => htmlUnDocument }),
    selecteur: selecteurPremierDocument(),
    convertisseur: convertisseurQuiEchoue("PDF corrompu"),
    syntheseur: syntheseur(async () => { appele = true; return null; }),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0004/AURIOL", deps);
  assert.equal(appele, false);
  assert.equal(resultat.methode_synthese, "structure_seule");
  assert.equal(resultat.documents.length, 1);
  assert.ok(resultat.avertissements.some((a) => a.includes("1 document(s) disponible(s)")));
});

test("l'échec de la sélection par IA (repli déterministe) déclenche un avertissement dédié quand plusieurs documents existent", async () => {
  const htmlDeuxDocuments = `<div id="content_document" class="bloc_content">
<span>2 document(s)</span>
<table>
<tr><th>Vignette</th><th>Nom</th><th>Type</th><th>Poids</th></tr>
<tr><td><div class="list"><div class="vignette"><a href="scan?name=A.TIF&path=/x"><img src="v.jpg"></a></div></div></td>
<td><a href="scan?name=A.TIF&path=/x">A.TIF</a></td>
<td><ul><li>COUPE GEOLOGIQUE DE CHANTIER</li></ul></td>
<td>10 Ko</td></tr>
<tr><td><div class="list"><div class="vignette"><a href="scan?name=B.TIF&path=/x"><img src="v.jpg"></a></div></div></td>
<td><a href="scan?name=B.TIF&path=/x">B.TIF</a></td>
<td><ul><li>COUPE GEOLOGIQUE INTERPRETEE</li></ul></td>
<td>12 Ko</td></tr>
</table>
</div>
<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>0</span></div>`;
  const deps = {
    infoterre: infoterreClient({ recupererFiche: async () => htmlDeuxDocuments }),
    selecteur: selecteurFixe({ document: { nom: "A.TIF", types: ["COUPE GEOLOGIQUE DE CHANTIER"], url_scan: "http://x/A.TIF" }, raison: null, methode: "deterministe" }),
    convertisseur: convertisseurFixe({ type: "image", pngBase64: "AAAA" }),
    syntheseur: syntheseur(async () => "Synthèse."),
    config: config(),
    log: LOG_STUB,
  };
  const resultat = await interpreterFiche("09372X0004/AURIOL", deps);
  assert.ok(resultat.avertissements.some((a) => a.includes("La sélection du document par IA")));
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
