import assert from "node:assert/strict";
import test from "node:test";
import { distanceKm, quantile, resumerEnsemble, validerCoordonnees } from "./meteoPoint.js";

test("validerCoordonnees accepte des coordonnées WGS84 et refuse les valeurs hors domaine", () => {
  assert.deepEqual(validerCoordonnees("44.064579", "3.683019"), { lat: 44.064579, lon: 3.683019 });
  assert.equal(validerCoordonnees("91", "3.68"), null);
  assert.equal(validerCoordonnees("texte", "3.68"), null);
});

test("quantile interpole une série triée sans modifier l'entrée", () => {
  const valeurs = [40, 10, 20, 30];
  assert.equal(quantile(valeurs, 0.5), 25);
  assert.deepEqual(valeurs, [40, 10, 20, 30]);
});

test("distanceKm donne une distance locale cohérente", () => {
  const distance = distanceKm(
    { lat: 44.064579, lon: 3.683019 },
    { lat: 44.121333, lon: 3.5815 },
  );
  assert.ok(distance > 9 && distance < 12);
});

test("resumerEnsemble calcule médiane, probabilités et dispersion sur les membres", () => {
  const resume = resumerEnsemble({
    daily: {
      time: ["2026-07-20"],
      temperature_2m_min: [10],
      temperature_2m_min_member01: [12],
      temperature_2m_min_member02: [14],
      temperature_2m_max: [20],
      temperature_2m_max_member01: [24],
      temperature_2m_max_member02: [28],
      precipitation_sum: [0],
      precipitation_sum_member01: [1],
      precipitation_sum_member02: [30],
      wind_gusts_10m_max: [40],
      wind_gusts_10m_max_member01: [80],
      wind_gusts_10m_max_member02: [100],
    },
  });

  assert.equal(resume.length, 1);
  assert.equal(resume[0]?.membres, 3);
  assert.equal(resume[0]?.temperatureMaxC.p50, 24);
  assert.equal(resume[0]?.probabilitePluiePct, 67);
  assert.equal(resume[0]?.probabilitePluieFortePct, 33);
  assert.equal(resume[0]?.probabiliteRafaleFortePct, 67);
  assert.equal(resume[0]?.incertitude, "forte");
});

test("resumerEnsemble se dégrade proprement sur un contrat incomplet", () => {
  assert.deepEqual(resumerEnsemble(null), []);
  assert.deepEqual(resumerEnsemble({ daily: {} }), []);
});
