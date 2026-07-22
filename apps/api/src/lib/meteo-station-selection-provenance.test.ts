import assert from "node:assert/strict";
import test from "node:test";
import type { StationMeteo } from "@opendata-vda/shared/stations-meteo";
import type { PublicStationSelection } from "./meteo-provenance.js";
import { addStationSelectionDiagnostics } from "./meteo-station-selection-provenance.js";
import type {
  StationCandidateEvaluation,
  StationSelectionDecision,
} from "./station-observations.js";

const station: StationMeteo = {
  id: "07156001",
  nom: "Montpellier",
  altitudeM: 3,
  lat: 43.577,
  lon: 3.963,
  reseau: "meteofrance",
  pack: "RADOME",
  licence: "Licence Ouverte 2.0",
};

function baseSelection(
  overrides: Partial<PublicStationSelection> = {},
): PublicStationSelection {
  return {
    policyVersion: "1",
    status: "no_eligible_station",
    reasonCode: "NO_ELIGIBLE_STATION",
    evaluatedCandidates: 1,
    eligibleCandidates: 0,
    selectedStationId: null,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<StationCandidateEvaluation> = {},
): StationCandidateEvaluation {
  return {
    station,
    temperatureC: 28.4,
    observedAt: "2026-07-22T11:00:00.000Z",
    distanceKm: 7.2,
    altitudeDifferenceM: 32,
    ageMinutes: 180,
    selectionScore: 48.2,
    stale: true,
    measurementValid: true,
    eligible: false,
    selected: false,
    rejectionReasons: ["TOO_OLD"],
    ...overrides,
  };
}

function decision(
  candidates: StationCandidateEvaluation[],
  overrides: Partial<StationSelectionDecision> = {},
): StationSelectionDecision {
  return {
    policyVersion: "1",
    status: "no_eligible_station",
    reasonCode: "NO_ELIGIBLE_STATION",
    receivedMeasurements: candidates.length,
    evaluatedCandidates: candidates.filter((item) => item.measurementValid).length,
    eligibleCandidates: candidates.filter((item) => item.eligible).length,
    selectedStationId: null,
    selected: null,
    candidates,
    ...overrides,
  };
}

test("expose les critères et la station examinée la plus proche", () => {
  const farther = candidate({
    station: { ...station, id: "07156002", nom: "Station éloignée" },
    distanceKm: 18.5,
    rejectionReasons: ["TOO_OLD", "SCORE_TOO_HIGH"],
  });
  const nearest = candidate();
  const diagnostics = addStationSelectionDiagnostics(
    baseSelection(),
    decision([farther, nearest]),
  );

  assert.equal(diagnostics.receivedMeasurements, 2);
  assert.equal(diagnostics.criteria.maximumDistanceKm, 50);
  assert.equal(diagnostics.criteria.maximumObservationAgeMinutes, 90);
  assert.equal(diagnostics.nearestCandidate?.id, "07156001");
  assert.deepEqual(diagnostics.nearestCandidate?.rejectionReasons, ["TOO_OLD"]);
  assert.deepEqual(diagnostics.rejectionSummary, [
    { reason: "TOO_OLD", count: 2 },
    { reason: "SCORE_TOO_HIGH", count: 1 },
  ]);
});

test("normalise en null l’horodatage invalide d’un candidat", () => {
  const invalid = candidate({
    observedAt: "not-a-date",
    ageMinutes: null,
    selectionScore: null,
    stale: null,
    measurementValid: false,
    rejectionReasons: ["INVALID_TIMESTAMP"],
  });
  const diagnostics = addStationSelectionDiagnostics(
    baseSelection({
      status: "no_measurements",
      reasonCode: "NO_VALID_MEASUREMENTS",
      evaluatedCandidates: 0,
    }),
    decision([invalid], {
      status: "no_measurements",
      reasonCode: "NO_VALID_MEASUREMENTS",
      evaluatedCandidates: 0,
    }),
  );

  assert.equal(diagnostics.nearestCandidate?.observedAt, null);
  assert.equal(diagnostics.nearestCandidate?.measurementValid, false);
  assert.match(diagnostics.message, /Aucune observation locale valide/);
});

test("reste explicite lorsque le fournisseur est indisponible", () => {
  const diagnostics = addStationSelectionDiagnostics(
    baseSelection({
      status: "provider_unavailable",
      reasonCode: "STATION_DATA_UNAVAILABLE",
      evaluatedCandidates: null,
      eligibleCandidates: null,
    }),
    null,
  );

  assert.equal(diagnostics.receivedMeasurements, null);
  assert.equal(diagnostics.nearestCandidate, null);
  assert.deepEqual(diagnostics.rejectionSummary, []);
  assert.match(diagnostics.message, /momentanément indisponibles/);
});
