import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  documentsCoupe,
  ErreurExtractionInfoterre,
  extraireDocuments,
  extraireLog,
} from "../src/domain/infoterre-parsing.js";

/**
 * Les fixtures sont des captures réelles servies par BRGM en `charset=ISO-8859-1` (confirmé
 * par l'en-tête HTTP, bien que la balise `<meta charset="UTF-8">` interne au HTML mente) :
 * on les relit en `latin1` pour reproduire fidèlement ce que `clients/infoterre.ts` doit décoder.
 */
function chargerFixture(nom: string): string {
  const chemin = fileURLToPath(new URL(`./fixtures/${nom}`, import.meta.url));
  return readFileSync(chemin, "latin1");
}

const HTML_MONNA = chargerFixture("infoterre-monna.html");
const HTML_VA2A = chargerFixture("infoterre-va2a.html");
const URL_MONNA = "http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=09372X0012/MONNA";
const URL_VA2A = "http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=09371X0028/VA-2A";

test("extrait les 3 documents numérisés de la fiche MONNA avec leur URL absolue", () => {
  const documents = extraireDocuments(HTML_MONNA, URL_MONNA);
  assert.equal(documents.length, 3);
  assert.deepEqual(documents[2], {
    nom: "M541404.TIF",
    types: ["COUPE GEOLOGIQUE INTERPRETEE"],
    url_scan: "http://ficheinfoterre.brgm.fr/InfoterreFiche/scan?name=M541404.TIF&path=/filer/scans/bss_9",
  });
});

test("extrait les 2 documents de la fiche VA-2A, tous deux coupe de chantier", () => {
  const documents = extraireDocuments(HTML_VA2A, URL_VA2A);
  assert.equal(documents.length, 2);
  assert.ok(documents.every((d) => d.types.includes("COUPE GEOLOGIQUE DE CHANTIER")));
});

test("documentsCoupe priorise la coupe interprétée avant la coupe de chantier", () => {
  const documents = extraireDocuments(HTML_MONNA, URL_MONNA);
  const coupes = documentsCoupe(documents);
  assert.equal(coupes.length, 1, "seul M541404.TIF est une coupe, les 2 autres sont des récapitulatifs");
  assert.equal(coupes[0]?.nom, "M541404.TIF");
});

test("documentsCoupe ne retient que les documents de type coupe géologique", () => {
  const coupes = documentsCoupe(extraireDocuments(HTML_VA2A, URL_VA2A));
  assert.equal(coupes.length, 2);
});

test("extrait les 3 niveaux du log géologique de MONNA malgré les <td> non refermés", () => {
  const log = extraireLog(HTML_MONNA);
  assert.equal(log.length, 3);
  assert.deepEqual(log[0], {
    profondeur_min_m: 0,
    profondeur_max_m: 2.5,
    lithologie: "ALLUV. A MAT.ARGILEUSE",
    stratigraphie: "QUATERNAIRE",
  });
  assert.deepEqual(log[2], {
    profondeur_min_m: 5,
    profondeur_max_m: 97,
    lithologie: "GRANITE GRIS AVEC PASSEES ROSEES FAILLES A 42 ET 82M",
    stratigraphie: "IMPRECIS",
  });
});

test("extrait les 2 niveaux du log de VA-2A, y compris une stratigraphie vide", () => {
  const log = extraireLog(HTML_VA2A);
  assert.equal(log.length, 2);
  assert.deepEqual(log[1], {
    profondeur_min_m: 5.7,
    profondeur_max_m: 14,
    lithologie: "SCHISTES CRISTALLINS",
    stratigraphie: "",
  });
});

test("retourne une liste vide si la section documents est absente de la fiche", () => {
  const html = "<html><body><div id=\"content_log\"></div></body></html>";
  assert.deepEqual(extraireDocuments(html, URL_MONNA), []);
});

test("retourne une liste vide si la section log est absente de la fiche", () => {
  const html = "<html><body><div id=\"content_document\"></div></body></html>";
  assert.deepEqual(extraireLog(html), []);
});

test("lève une erreur si la section documents est présente mais non reconnue", () => {
  const html = '<div id="content_document"><span>2 document(s)</span><p>format inattendu</p></div>';
  assert.throws(() => extraireDocuments(html, URL_MONNA), ErreurExtractionInfoterre);
});

test("lève une erreur si la section log est présente mais non reconnue", () => {
  const html = '<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>1</span><p>?</p></div>';
  assert.throws(() => extraireLog(html), ErreurExtractionInfoterre);
});

test("ne lève pas d'erreur si la section déclare explicitement 0 document / 0 niveau", () => {
  const htmlDocuments = '<div id="content_document"><span>0 document(s)</span></div>';
  assert.deepEqual(extraireDocuments(htmlDocuments, URL_MONNA), []);

  const htmlLog = '<div id="content_log"><h3 class="nbPasses">Nombre de niveaux :</h3><span>0</span></div>';
  assert.deepEqual(extraireLog(htmlLog), []);
});
