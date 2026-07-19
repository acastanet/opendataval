import assert from "node:assert/strict";
import test from "node:test";
import { cleDate, dateParis, evaluerFraicheurFirms, parseHours } from "./incendies.js";

test("évalue les seuils de fraîcheur FIRMS", () => {
  const maintenant = Date.parse("2026-07-18T08:00:00Z");
  assert.deepEqual(evaluerFraicheurFirms("2026-07-18T07:01:00Z", maintenant), { etat: "fraiche", age_minutes: 59 });
  assert.deepEqual(evaluerFraicheurFirms("2026-07-18T07:00:00Z", maintenant), { etat: "ancienne", age_minutes: 60 });
  assert.deepEqual(evaluerFraicheurFirms("2026-07-18T02:00:00Z", maintenant), { etat: "ancienne", age_minutes: 360 });
  assert.deepEqual(evaluerFraicheurFirms("2026-07-18T01:59:00Z", maintenant), { etat: "indisponible", age_minutes: 361 });
  assert.deepEqual(evaluerFraicheurFirms(null, maintenant), { etat: "indisponible", age_minutes: null });
});

test("calcule les dates civiles parisiennes lors du passage à l'heure d'hiver", () => {
  const veilleDuChangement = new Date("2026-10-24T22:30:00Z");
  assert.equal(dateParis(0, veilleDuChangement), "2026-10-25");
  assert.equal(dateParis(1, veilleDuChangement), "2026-10-26");
});

test("borne la période publique à 1..72 heures", () => {
  assert.equal(parseHours(undefined), 24);
  assert.equal(parseHours("1"), 1);
  assert.equal(parseHours("72"), 72);
  for (const valeur of ["0", "73", "1.5", "abc", "-1"]) assert.equal(parseHours(valeur), null);
});

test("normalise une date PostgreSQL sans dépendre du fuseau", () => {
  assert.equal(cleDate("2026-07-18T00:00:00.000Z"), "2026-07-18");
  assert.equal(cleDate(new Date("2026-07-18T23:00:00Z")), "2026-07-18");
});
