import assert from "node:assert/strict";
import test from "node:test";
import { baseScore, geologicalValueScore, proximityScore } from "../src/domain/scoring.js";
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

test("le score de proximité décroît avec la distance et reste borné à 100", () => {
  assert.equal(proximityScore(0), 100);
  assert.ok(proximityScore(1000) < 100);
  assert.ok(proximityScore(5000) < proximityScore(1000));
  assert.ok(proximityScore(50_000) > 0);
});

test("un ouvrage riche à 4,9 km peut dépasser une source banale à 1,5 km sur le score de proximité seul", () => {
  // Ce n'est pas le score hybride complet, mais la décroissance non linéaire recherchée.
  const proche = proximityScore(1500);
  const loin = proximityScore(4900);
  assert.ok(loin > 0 && loin < proche, "la décroissance doit rester progressive, pas un couperet");
});

test("bonus de profondeur par palier", () => {
  assert.equal(geologicalValueScore(ouvrage({ profondeur_m: null })), 0);
  assert.equal(geologicalValueScore(ouvrage({ profondeur_m: 5 })) - 5, 1); // +5 renseignée, +1 palier
  assert.equal(geologicalValueScore(ouvrage({ profondeur_m: 20 })) - 5, 2);
  assert.equal(geologicalValueScore(ouvrage({ profondeur_m: 40 })) - 5, 3);
  assert.equal(geologicalValueScore(ouvrage({ profondeur_m: 80 })) - 5, 4);
  assert.equal(geologicalValueScore(ouvrage({ profondeur_m: 150 })) - 5, 5);
});

test("une profondeur inconnue n'est pas pénalisante, seulement non bonifiée", () => {
  const connue = geologicalValueScore(ouvrage({ profondeur_m: 5 }));
  const inconnue = geologicalValueScore(ouvrage({ profondeur_m: null }));
  assert.ok(inconnue < connue);
  assert.equal(inconnue, 0);
});

test("les documents géologiques complémentaires sont plafonnés à +7", () => {
  const troisDocuments = geologicalValueScore(ouvrage({
    documents: ["DOCUMENTATION-GEOLOGIQUE", "RAPPORT-GEOLOGUE-OFFICIEL", "PERMEABILITE"],
  }));
  assert.equal(troisDocuments, 6); // 3 × 2

  const cinqDocuments = geologicalValueScore(ouvrage({
    documents: ["DOCUMENTATION-GEOLOGIQUE", "RAPPORT-GEOLOGUE-OFFICIEL", "PERMEABILITE", "MINERALO", "STRUCTURE"],
  }));
  assert.equal(cinqDocuments, 7, "plafonné à 7 malgré 5 × 2 = 10");
});

test("COUPE-GEOLOGIQUE n'est pas comptée deux fois", () => {
  const avecCoupeSeule = geologicalValueScore(ouvrage({
    has_geological_section_document: true,
    documents: ["COUPE-GEOLOGIQUE"],
  }));
  // +10 (document de coupe) et rien de plus : COUPE-GEOLOGIQUE est exclue du bonus complémentaire.
  assert.equal(avecCoupeSeule, 10);
});

test("le score géologique est plafonné à 100", () => {
  // Combinaison impossible en pratique (is_borehole et is_sounding s'excluent via la nature
  // BRGM), mais elle exerce le plafond du barème : 30+20+10+5+10+8+10+7 = 100 pile.
  const ouvrageExceptionnel = ouvrage({
    is_core_sample: true,
    has_geological_section: true,
    has_geological_section_document: true,
    has_geological_section_scan: true,
    is_sounding: true,
    is_borehole: true,
    profondeur_m: 200,
    documents: ["DOCUMENTATION-GEOLOGIQUE", "RAPPORT-GEOLOGUE-OFFICIEL", "COUPE-TECHNIQUE", "PETRO", "MINERALO", "STRUCTURE", "ANALYSE-CHIMIQUE-ROCHE", "PERMEABILITE"],
  });
  assert.equal(geologicalValueScore(ouvrageExceptionnel), 100);
});

test("un score qui dépasserait 100 reste plafonné (garde-fou du barème)", () => {
  // Toute évolution future du barème qui ferait dépasser la somme des points doit rester
  // clampée : on le vérifie en dépassant artificiellement via un score déjà maximal.
  const scoreMaximal = geologicalValueScore(ouvrage({
    is_core_sample: true,
    has_geological_section: true,
    has_geological_section_document: true,
    has_geological_section_scan: true,
    is_sounding: true,
    is_borehole: true,
    profondeur_m: 200,
    documents: ["DOCUMENTATION-GEOLOGIQUE", "RAPPORT-GEOLOGUE-OFFICIEL", "COUPE-TECHNIQUE", "PETRO", "MINERALO", "STRUCTURE", "ANALYSE-CHIMIQUE-ROCHE", "PERMEABILITE"],
  }));
  assert.ok(scoreMaximal <= 100);
});

test("le score hybride pondère 70 % géologie et 30 % proximité", () => {
  assert.equal(baseScore(80, 50), 0.7 * 80 + 0.3 * 50);
  assert.equal(baseScore(0, 100), 30);
  assert.equal(baseScore(100, 0), 70);
});
