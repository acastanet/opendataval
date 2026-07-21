import assert from "node:assert/strict";
import test from "node:test";
import { datesIso, jourClimatologique, nombreOuNull, periodeMensuelle } from "./meteoClimate.js";

test("jourClimatologique réserve une position stable au 29 février", () => {
  assert.equal(jourClimatologique(new Date("2024-02-29T12:00:00Z")), 60);
  assert.equal(jourClimatologique(new Date("2025-03-01T12:00:00Z")), 61);
});

test("periodeMensuelle gère les mois bissextiles", () => {
  assert.deepEqual(periodeMensuelle(2024, 2), { debut: "2024-02-01", fin: "2024-02-29" });
});

test("nombreOuNull convertit les numeric PostgreSQL", () => {
  assert.equal(nombreOuNull("25.4"), 25.4);
  assert.equal(nombreOuNull(null), null);
  assert.equal(nombreOuNull("invalide"), null);
});

test("datesIso normalise les tableaux date PostgreSQL", () => {
  assert.deepEqual(datesIso(["2026-06-03", new Date("2026-06-12T00:00:00Z")]), ["2026-06-03", "2026-06-12"]);
  assert.deepEqual(datesIso("{2026-06-04,2026-06-18}"), ["2026-06-04", "2026-06-18"]);
  assert.deepEqual(datesIso(null), []);
});
