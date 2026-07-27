import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCommune, normalizeStatus, normalizedText, validDate } from "../src/normalization.js";

test("normalise les anciennes communes de Val-d’Aigoual", () => {
  assert.equal(normalizeCommune("30190", "Notre-Dame-de-la-Rouvière"), "30339");
  assert.equal(normalizeCommune("30339", "Valleraugue"), "30339");
  assert.equal(normalizeCommune("30000", "Nîmes"), null);
});
test("conserve un statut absent comme inconnu et rejette les dates invalides", () => {
  assert.equal(normalizeStatus(undefined), "unknown");
  assert.equal(normalizeStatus("dissoute"), "dissolved");
  assert.equal(validDate("2026-99-01"), null);
  assert.equal(normalizedText("Mémoire d’Aigoual"), "MEMOIRE D AIGOUAL");
});
