import assert from "node:assert/strict";
import test from "node:test";
import {
  POINTS_METEO_PRECONFIGURES,
  normaliserCoordonneesMeteo,
  resoudreLocalisationMeteo,
} from "@opendata-vda/shared";
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

test("les trois points météo partagés conservent leurs coordonnées contractuelles", () => {
  assert.deepEqual(
    POINTS_METEO_PRECONFIGURES.map(({ slug, lat, lon }) => ({ slug, lat, lon })),
    [
      { slug: "val-aigoual", lat: 44.081192, lon: 3.641467 },
      { slug: "paris", lat: 48.8566, lon: 2.3522 },
      { slug: "marseille", lat: 43.2965, lon: 5.3698 },
    ],
  );
});

test("resoudreLocalisationMeteo distingue une correspondance exacte d'un point précis", () => {
  const paris = resoudreLocalisationMeteo(48.8566, 2.3522);
  assert.equal(paris.type, "preconfiguree");
  assert.equal(paris.pointPreconfigure?.slug, "paris");
  assert.equal(paris.cleCache, "preconfiguree:paris");

  const procheParis = resoudreLocalisationMeteo(48.85661, 2.3522);
  assert.equal(procheParis.type, "precise");
  assert.equal(procheParis.pointPreconfigure, null);
  assert.equal(procheParis.cleCache, "precise:48.8566,2.3522");
});

test("normaliserCoordonneesMeteo produit une clé géographique stable sans zéro négatif", () => {
  assert.deepEqual(normaliserCoordonneesMeteo(44.064579, 3.683019), { lat: 44.0646, lon: 3.683 });
  assert.deepEqual(normaliserCoordonneesMeteo(-0.00001, -0.00001), { lat: 0, lon: 0 });
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
