import assert from "node:assert/strict";
import test from "node:test";
import { agregerRevisions, resumerRevisions } from "./meteoRevisions.js";

test("agregerRevisions compare les runs J-1 et J par journée", () => {
  const comparaisons = agregerRevisions({
    hourly: {
      time: ["2026-07-20T00:00", "2026-07-20T12:00", "2026-07-21T00:00"],
      temperature_2m: [10, 22, 12],
      temperature_2m_previous_day1: [9, 20, 10],
      precipitation: [0, 5, 0],
      precipitation_previous_day1: [0, 1, 0],
      weather_code: [1, 63, 0],
      weather_code_previous_day1: [2, 3, 0],
    },
  });

  assert.equal(comparaisons.length, 2);
  assert.deepEqual(comparaisons[0], {
    date: "2026-07-20",
    jMoins1: {
      temperatureMinC: 9,
      temperatureMaxC: 20,
      precipitationMm: 1,
      codeMeteo: 3,
      condition: "Couvert",
    },
    j: {
      temperatureMinC: 10,
      temperatureMaxC: 22,
      precipitationMm: 5,
      codeMeteo: 63,
      condition: "Pluie",
    },
    ecarts: {
      temperatureMinC: 1,
      temperatureMaxC: 2,
      precipitationMm: 4,
      heuresScenarioComparees: 2,
      heuresScenarioModifiees: 1,
      tauxScenarioModifiePct: 50,
    },
    niveauRevision: "marquee",
  });
});

test("resumerRevisions conserve le sens des ajustements dans les écarts moyens", () => {
  const comparaisons = agregerRevisions({
    hourly: {
      time: ["2026-07-20T00:00", "2026-07-21T00:00"],
      temperature_2m: [12, 8],
      temperature_2m_previous_day1: [10, 10],
      precipitation: [4, 0],
      precipitation_previous_day1: [1, 2],
      weather_code: [61, 0],
      weather_code_previous_day1: [3, 0],
    },
  });
  const resume = resumerRevisions(comparaisons);

  assert.equal(resume.joursComparables, 2);
  assert.equal(resume.ecartMoyenTemperatureMinC, 0);
  assert.equal(resume.ecartMoyenTemperatureMaxC, 0);
  assert.equal(resume.ecartMoyenPrecipitationMm, 0.5);
  assert.equal(resume.joursScenarioRevise, 1);
});
