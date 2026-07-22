import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { StationMeteo } from "@opendata-vda/shared/stations-meteo";
import {
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
  const selected = selectStationObservation(
    { latitude: 44.081192, longitude: 3.641467, altitudeM: null },
    [measurement(summit, 5)],
    now,
  );

  assert.equal(selected, null);
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
