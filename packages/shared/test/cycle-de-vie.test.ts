import test from "node:test";
import assert from "node:assert/strict";
import { ETATS_DALLE, transitionAutorisee, transitionValide, type EtatDalle } from "../src/dalle.js";

const TRANSITIONS_ATTENDUES: Array<[EtatDalle, EtatDalle]> = [
  ["created", "collecting"],
  ["collecting", "generated"],
  ["collecting", "failed"],
  ["generated", "review_required"],
  ["review_required", "approved"],
  ["review_required", "collecting"],
  ["approved", "published"],
];

test("autorise exactement les transitions du cycle de vie décrit dans 02-TILE-CONTRACT.md", () => {
  for (const [depuis, vers] of TRANSITIONS_ATTENDUES) {
    assert.ok(transitionAutorisee(depuis, vers), `${depuis} → ${vers} devrait être autorisée`);
  }
});

test("refuse toute transition non listée", () => {
  const autorisees = new Set(TRANSITIONS_ATTENDUES.map(([d, v]) => `${d}→${v}`));
  for (const depuis of ETATS_DALLE) {
    for (const vers of ETATS_DALLE) {
      if (depuis === vers) continue;
      if (autorisees.has(`${depuis}→${vers}`)) continue;
      assert.equal(transitionAutorisee(depuis, vers), false, `${depuis} → ${vers} devrait être refusée`);
    }
  }
});

test("refuse created → published (saut direct du cycle de vie)", () => {
  assert.equal(transitionAutorisee("created", "published"), false);
});

test("bloque l'entrée en approved sans revue humaine approuvée", () => {
  assert.equal(transitionValide("review_required", "approved", "pending"), false);
  assert.equal(transitionValide("review_required", "approved", "changes_requested"), false);
  assert.equal(transitionValide("review_required", "approved", "approved"), true);
});

test("garde le retour review_required → collecting réservé aux corrections demandées", () => {
  // Le graphe l'autorise indépendamment du motif ; c'est site-service qui ne déclenchera ce
  // retour que sur changes_requested, mais le contrat ne doit pas l'interdire structurellement.
  assert.ok(transitionAutorisee("review_required", "collecting"));
});
