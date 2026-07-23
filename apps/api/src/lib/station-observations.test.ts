import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { StationMeteo } from "@opendata-vda/shared/stations-meteo";
import {
  evaluateStationObservations,
  loadLatestStationMeasurements,
  loadNearbyStationMeasurements,
  loadNearbyStations,
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

test("présélectionne dans PostGIS les stations situées autour du point demandé", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return {
        rows: [{
          external_id: "07156",
          props: {
            nom: "Paris-Montsouris",
            altitude_m: "75",
            reseau: "meteofrance",
            pack: "RADOME",
            licence: "Licence Ouverte 2.0",
          },
          latitude: "48.8217",
          longitude: "2.3378",
        }],
      };
    },
  } as unknown as pg.Pool;

  const stations = await loadNearbyStations(
    pool,
    { latitude: 48.8566, longitude: 2.3522 },
  );

  assert.equal(stations.length, 1);
  assert.deepEqual(stations[0], {
    id: "07156",
    nom: "Paris-Montsouris",
    altitudeM: 75,
    lon: 2.3378,
    lat: 48.8217,
    reseau: "meteofrance",
    pack: "RADOME",
    licence: "Licence Ouverte 2.0",
  });
  assert.match(calls[0]?.sql ?? "", /ST_DWithin/);
  assert.match(calls[0]?.sql ?? "", /couche = 'station_meteo'/);
  assert.deepEqual(calls[0]?.values, [2.3522, 48.8566, 50_000]);
});

test("le repli historique reste local et ne propose aucune station cévenole à Paris", async () => {
  const pool = {
    query: async () => ({ rows: [] }),
  } as unknown as pg.Pool;

  const parisStations = await loadNearbyStations(
    pool,
    { latitude: 48.8566, longitude: 2.3522 },
  );
  const valAigoualStations = await loadNearbyStations(
    pool,
    { latitude: 44.081192, longitude: 3.641467 },
  );

  assert.deepEqual(parisStations, []);
  assert.ok(valAigoualStations.some((candidate) => candidate.id === "000UB"));
  assert.ok(valAigoualStations.every((candidate) => {
    const decision = evaluateStationObservations(
      { latitude: 44.081192, longitude: 3.641467, altitudeM: 354 },
      [measurement(candidate, 5)],
      now,
    );
    return !decision.candidates[0]?.rejectionReasons.includes("TOO_FAR");
  }));
});

test("charge les observations uniquement pour les stations retenues spatialement", async () => {
  const calls: string[] = [];
  const pool = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("from couches.objets")) {
        return {
          rows: [{
            external_id: "07690",
            props: {
              nom: "Marseille-Marignane",
              altitude_m: 9,
              reseau: "meteofrance",
              pack: "RADOME",
              licence: "Licence Ouverte 2.0",
            },
            latitude: 43.4377,
            longitude: 5.216,
          }],
        };
      }
      return {
        rows: [{
          num_poste: "07690",
          t: "29.2",
          heure_utc: "2026-07-22T13:30:00Z",
        }],
      };
    },
  } as unknown as pg.Pool;

  const measurements = await loadNearbyStationMeasurements(
    pool,
    { latitude: 43.2965, longitude: 5.3698 },
  );

  assert.equal(calls.length, 2);
  assert.equal(measurements.length, 1);
  assert.equal(measurements[0]?.station.id, "07690");
  assert.equal(measurements[0]?.temperatureC, 29.2);
  assert.equal(measurements[0]?.observedAt, "2026-07-22T13:30:00.000Z");
});
