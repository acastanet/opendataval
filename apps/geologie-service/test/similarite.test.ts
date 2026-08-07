import assert from "node:assert/strict";
import test from "node:test";
import { similarite } from "../src/domain/similarite.js";
import type { OuvrageBss } from "../src/types.js";

function ouvrage(overrides: Partial<OuvrageBss> = {}): OuvrageBss {
  return {
    bss_id: "TEST",
    ancien_code_bss: null,
    designation: null,
    nature_brgm: null,
    distance_m: 1000,
    x_l93: 0,
    y_l93: 0,
    profondeur_m: null,
    altitude_m: null,
    mode_execution: null,
    commune_bss: null,
    lieu_dit: null,
    longitude: null,
    latitude: null,
    is_borehole: false,
    is_sounding: false,
    is_core_sample: false,
    has_geological_section: false,
    has_geological_section_document: false,
    has_geological_section_scan: false,
    documents: [],
    fiche_infoterre: null,
    ...overrides,
  };
}

test("deux sondages jumeaux (cas VA) atteignent une similarité de 1.0", () => {
  const va2a = ouvrage({
    bss_id: "BSS002DKEC", x_l93: 754_237, y_l93: 6_324_872,
    nature_brgm: "SONDAGE", mode_execution: "ROTATION,CAROTTAGE,EAU.",
    documents: ["COUPE-GEOLOGIQUE", "PERMEABILITE"], profondeur_m: 14,
  });
  const dd = ouvrage({
    bss_id: "BSS002DKDD", x_l93: 754_237 + 50, y_l93: 6_324_872 + 50,
    nature_brgm: "SONDAGE", mode_execution: "ROTATION,CAROTTAGE,EAU.",
    documents: ["COUPE-GEOLOGIQUE", "PERMEABILITE"], profondeur_m: 15.65,
  });
  assert.equal(similarite(va2a, dd), 1);
});

test("deux ouvrages éloignés et dissemblables ont une similarité proche de zéro", () => {
  const a = ouvrage({ bss_id: "A", x_l93: 0, y_l93: 0, nature_brgm: "SOURCE" });
  const b = ouvrage({ bss_id: "B", x_l93: 50_000, y_l93: 50_000, nature_brgm: "FORAGE", mode_execution: "MARTEAU-FOND." });
  assert.equal(similarite(a, b), 0);
});

test("deux modes d'exécution vides ne créent pas de similarité", () => {
  const a = ouvrage({ x_l93: 0, y_l93: 0, mode_execution: null });
  const b = ouvrage({ x_l93: 50_000, y_l93: 50_000, mode_execution: null });
  assert.equal(similarite(a, b), 0);
});

test("la similarité documentaire suit l'indice de Jaccard", () => {
  const a = ouvrage({ x_l93: 0, y_l93: 50_000, documents: ["COUPE-GEOLOGIQUE", "PERMEABILITE"] });
  const b = ouvrage({ x_l93: 0, y_l93: 100_000, documents: ["COUPE-GEOLOGIQUE"] });
  // Jaccard = 1/2 = 0.5, pondéré à 0.20 → 0.10.
  assert.ok(Math.abs(similarite(a, b) - 0.1) < 1e-9);
});

test("deux listes de documents vides n'ajoutent aucune similarité", () => {
  const a = ouvrage({ x_l93: 0, y_l93: 50_000, documents: [] });
  const b = ouvrage({ x_l93: 0, y_l93: 100_000, documents: [] });
  assert.equal(similarite(a, b), 0);
});

test("la profondeur proche ne compte que si les deux valeurs sont connues", () => {
  const connuA = ouvrage({ x_l93: 0, y_l93: 50_000, profondeur_m: 10 });
  const connuB = ouvrage({ x_l93: 0, y_l93: 100_000, profondeur_m: 12 });
  assert.ok(Math.abs(similarite(connuA, connuB) - 0.1) < 1e-9);

  const inconnu = ouvrage({ x_l93: 0, y_l93: 100_000, profondeur_m: null });
  assert.equal(similarite(connuA, inconnu), 0);
});

test("la similarité est plafonnée à 1.0", () => {
  const a = ouvrage({
    x_l93: 0, y_l93: 0, nature_brgm: "SONDAGE", mode_execution: "ROTATION,CAROTTAGE,EAU.",
    documents: ["COUPE-GEOLOGIQUE"], profondeur_m: 10,
  });
  const b = ouvrage({
    x_l93: 10, y_l93: 10, nature_brgm: "SONDAGE", mode_execution: "ROTATION,CAROTTAGE,EAU.",
    documents: ["COUPE-GEOLOGIQUE"], profondeur_m: 10,
  });
  assert.equal(similarite(a, b), 1);
});
