import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { StationMeteo } from "@opendata-vda/shared/stations-meteo";
import {
  evaluateStationObservations,
  loadLatestStationMeasurements,
  selectStationObservation,
  type StationMeasurement,
} from "./station-observations.js";

const now = new Date("2026-07-22T14:00:00.000Z");

function station(
  id: string,
  nom: string,
  lat: number,
  lon: number,
  altitudeM: number,
  reseau: StationMeteo["reseau"] = "meteofrance",
): StationMeteo {
  return { id, nom, lat, lon, altitudeM, reseau, licence: "test" };
}

function measurement(
  stationValue: StationMeteo,
  minutesAgo: number,
  temperatureC = 20,
): StationMeasurement {
  return {
    station: stationValue,
    temperatureC,
    observedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
  };
}

test("préfère une station de vallée représentative au sommet géographiquement proche", () => {
  const summit = station("summit", "Mont Aigoual", 44.121333, 3.5815, 1567);
  const valley = station("valley", "Valleraugue", 44.0828, 3.62148, 400, "infoclimat");

  const selected = selectStationObservation(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: 354 },
    [measurement(summit, 5, 12), measurement(valley, 30, 23)],
    now,
  );

  assert.equal(selected?.station.id, "valley");
  assert.equal(selected?.temperatureC, 23);
  assert.ok((selected?.altitudeDifferenceM ?? 999) < 50);
});

test("la fraîcheur peut départager deux stations comparables", () => {
  const veryClose = station("old", "Proche", 44.09, 3.64, 390);
  const fresh = station("fresh", "Récente", 44.12, 3.64, 410);

  const selected = selectStationObservation(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: 400 },
    [measurement(veryClose, 85), measurement(fresh, 5)],
    now,
  );

  assert.equal(selected?.station.id, "fresh");
});

test("retourne une décision structurée et distingue la candidate admissible non retenue", () => {
  const nearest = station("nearest", "La plus proche", 44.082, 3.642, 400);
  const runnerUp = station("runner-up", "Seconde", 44.09, 3.64, 400);

  const decision = evaluateStationObservations(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: 400 },
    [measurement(nearest, 10), measurement(runnerUp, 20)],
    now,
  );

  assert.equal(decision.policyVersion, "1");
  assert.equal(decision.status, "selected");
  assert.equal(decision.reasonCode, "BEST_ELIGIBLE_STATION");
  assert.equal(decision.receivedMeasurements, 2);
  assert.equal(decision.evaluatedCandidates, 2);
  assert.equal(decision.eligibleCandidates, 2);
  assert.equal(decision.selectedStationId, "nearest");

  const selectedCandidate = decision.candidates.find((item) => item.station.id === "nearest");
  const unselectedCandidate = decision.candidates.find((item) => item.station.id === "runner-up");
  if (!selectedCandidate || !unselectedCandidate) {
    throw new Error("Candidates de test introuvables");
  }
  assert.equal(selectedCandidate.selected, true);
  assert.deepEqual(selectedCandidate.rejectionReasons, []);
  assert.equal(unselectedCandidate.eligible, true);
  assert.equal(unselectedCandidate.selected, false);
  assert.deepEqual(unselectedCandidate.rejectionReasons, ["ELIGIBLE_NOT_SELECTED"]);
});

test("cumule les motifs de rejet d'une candidate", () => {
  const candidate = station("bad", "Lointaine et trop haute", 43.2, 3.64, 1400);
  const decision = evaluateStationObservations(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: 350 },
    [measurement(candidate, 91)],
    now,
  );

  assert.equal(decision.status, "no_eligible_station");
  assert.equal(decision.reasonCode, "NO_ELIGIBLE_STATION");
  assert.equal(decision.evaluatedCandidates, 1);
  assert.equal(decision.eligibleCandidates, 0);
  assert.deepEqual(decision.candidates[0]?.rejectionReasons, [
    "TOO_FAR",
    "ALTITUDE_MISMATCH",
    "TOO_OLD",
    "SCORE_TOO_HIGH",
  ]);
});

test("distingue l'absence de mesure valide de l'absence de station admissible", () => {
  const invalid = station("invalid", "Invalide", 44.08, 3.64, 400);
  const decision = evaluateStationObservations(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: 350 },
    [{ station: invalid, temperatureC: Number.NaN, observedAt: "date-invalide" }],
    now,
  );

  assert.equal(decision.status, "no_measurements");
  assert.equal(decision.reasonCode, "NO_VALID_MEASUREMENTS");
  assert.equal(decision.receivedMeasurements, 1);
  assert.equal(decision.evaluatedCandidates, 0);
  assert.deepEqual(decision.candidates[0]?.rejectionReasons, [
    "INVALID_TEMPERATURE",
    "INVALID_TIMESTAMP",
  ]);
});

test("refuse un horodatage situé au-delà de la tolérance future", () => {
  const future = station("future", "Dans le futur", 44.082, 3.642, 400);
  const decision = evaluateStationObservations(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: 400 },
    [measurement(future, -16)],
    now,
  );

  assert.equal(decision.status, "no_eligible_station");
  assert.equal(decision.evaluatedCandidates, 1);
  assert.deepEqual(decision.candidates[0]?.rejectionReasons, ["FUTURE_TIMESTAMP"]);
});

test("refuse les mesures trop anciennes, trop lointaines ou incohérentes en altitude", () => {
  const old = station("old", "Ancienne", 44.08, 3.64, 400);
  const far = station("far", "Lointaine", 43.2, 3.64, 400);
  const summit = station("summit", "Sommet", 44.1, 3.62, 1400);

  const selected = selectStationObservation(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: 350 },
    [measurement(old, 91), measurement(far, 5), measurement(summit, 5)],
    now,
  );

  assert.equal(selected, null);
});

test("continue à sélectionner par distance et fraîcheur si l'altitude IGN manque", () => {
  const nearby = station("nearby", "Proche", 44.082, 3.642, 1200);
  const selected = selectStationObservation(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: null },
    [measurement(nearby, 10)],
    now,
  );

  assert.equal(selected?.station.id, "nearby");
  assert.equal(selected?.altitudeDifferenceM, null);
});

test("sans altitude IGN, refuse une station qui n'est pas immédiatement locale", () => {
  const summit = station("summit", "Mont Aigoual", 44.121333, 3.5815, 1567);
  const decision = evaluateStationObservations(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: null },
    [measurement(summit, 5)],
    now,
  );

  assert.equal(decision.selected, null);
  assert.deepEqual(decision.candidates[0]?.rejectionReasons, ["ALTITUDE_UNKNOWN_TOO_FAR"]);
});

test("normalise les types PostgreSQL et ignore les lignes invalides", async () => {
  const stations = [station("valid", "Valide", 44.08, 3.64, 400)];
  const pool = {
    query: async () => ({
      rows: [
        { num_poste: "valid", t: "21.4", heure_utc: new Date("2026-07-22T13:30:00Z") },
        { num_poste: "unknown", t: "20", heure_utc: "2026-07-22T13:30:00Z" },
        { num_poste: "valid", t: "not-a-number", heure_utc: "2026-07-22T13:30:00Z" },
      ],
    }),
  } as unknown as pg.Pool;

  const measurements = await loadLatestStationMeasurements(pool, stations);

  assert.deepEqual(measurements, [{
    station: stations[0],
    temperatureC: 21.4,
    observedAt: "2026-07-22T13:30:00.000Z",
  }]);
});
