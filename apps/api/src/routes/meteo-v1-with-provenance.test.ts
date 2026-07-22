import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type pg from "pg";
import type { ResolvedGeography } from "../lib/geography.js";
import type { StationMeasurement } from "../lib/station-observations.js";
import { registerMeteoV1RoutesWithProvenance } from "./meteo-v1-with-provenance.js";

const now = new Date("2026-07-22T14:00:00.000Z");
const paris: ResolvedGeography = {
  coordinates: { latitude: 48.8566, longitude: 2.3522 },
  label: "Paris",
  municipality: { name: "Paris", inseeCode: "75056" },
  department: { name: "Paris", code: "75" },
  altitudeM: 35,
  resolution: { administrative: "ign", altitude: "ign" },
  unavailableSources: [],
  generatedAt: now.toISOString(),
};
const valAigoual: ResolvedGeography = {
  coordinates: { latitude: 44.081192, longitude: 3.641467 },
  label: "Val-d’Aigoual",
  municipality: { name: "Val-d’Aigoual", inseeCode: "30339" },
  department: { name: "Gard", code: "30" },
  altitudeM: 354,
  resolution: { administrative: "ign", altitude: "ign" },
  unavailableSources: [],
  generatedAt: now.toISOString(),
};

const weatherData = {
  current: {
    time: 1784728800,
    temperature_2m: 25.3,
    apparent_temperature: 25.8,
    weather_code: 1,
  },
  hourly: {
    time: [1784728800, 1784732400, 1784736000],
    temperature_2m: [25.3, 25.8, 26.1],
    precipitation_probability: [0, 10, 10],
    wind_gusts_10m: [10, 12, 13],
    weather_code: [1, 1, 2],
  },
  daily: {
    time: [1784678400],
    temperature_2m_max: [27],
    temperature_2m_min: [18],
  },
};

function fakePool(): pg.Pool {
  return { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
}

function vigilance() {
  return {
    niveau: "green" as const,
    phenomenes: [],
    miseAJour: now,
    indisponible: false,
  };
}

test("essential expose une provenance modélisée lorsque le réseau ne fournit aucune mesure", async () => {
  const app = Fastify();
  registerMeteoV1RoutesWithProvenance(app, fakePool(), {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => vigilance(),
    loadStationMeasurements: async () => [],
    now: () => now,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(payload.current.nature, "model");
  assert.equal(payload.provenance.schemaVersion, "1.0");
  assert.equal(payload.provenance.weatherMode, "model");
  assert.equal(payload.provenance.values.currentTemperature.nature, "model");
  assert.equal(payload.provenance.stationSelection.status, "no_measurements");
  await app.close();
});

test("essential expose le caractère hybride et la station effectivement retenue", async () => {
  const measurements: StationMeasurement[] = [
    {
      station: {
        id: "30339001",
        nom: "Mont Aigoual",
        altitudeM: 1567,
        lat: 44.121333,
        lon: 3.5815,
        reseau: "meteofrance",
        pack: "RADOME",
        licence: "Licence Ouverte 2.0",
      },
      temperatureC: 12,
      observedAt: "2026-07-22T13:54:00.000Z",
    },
    {
      station: {
        id: "000UB",
        nom: "Valleraugue",
        altitudeM: 400,
        lat: 44.0828,
        lon: 3.62148,
        reseau: "infoclimat",
        licence: "CC BY-NC 4.0",
      },
      temperatureC: 23.4,
      observedAt: "2026-07-22T13:30:00.000Z",
    },
  ];
  const app = Fastify();
  registerMeteoV1RoutesWithProvenance(app, fakePool(), {
    resolveGeography: async () => valAigoual,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => vigilance(),
    loadStationMeasurements: async () => measurements,
    now: () => now,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=44.081192&lon=3.641467",
  });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(payload.current.station.id, "000UB");
  assert.equal(payload.provenance.weatherMode, "hybrid");
  assert.equal(payload.provenance.values.currentTemperature.nature, "observation");
  assert.equal(payload.provenance.values.currentTemperature.station.id, "000UB");
  assert.equal(payload.provenance.values.apparentTemperature.nature, "model");
  assert.equal(payload.provenance.stationSelection.status, "selected");
  assert.equal(payload.provenance.stationSelection.selectedStationId, "000UB");
  await app.close();
});

test("essential distingue l’indisponibilité technique du fournisseur d’observations", async () => {
  const app = Fastify();
  registerMeteoV1RoutesWithProvenance(app, fakePool(), {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => vigilance(),
    loadStationMeasurements: async () => {
      throw new Error("database unavailable");
    },
    now: () => now,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.ok(payload.unavailableSources.includes("Observations locales"));
  assert.equal(payload.provenance.stationSelection.status, "provider_unavailable");
  assert.equal(payload.provenance.stationSelection.evaluatedCandidates, null);
  await app.close();
});

test("essential marque la géographie et la vigilance indisponibles sans inventer de source", async () => {
  const app = Fastify();
  registerMeteoV1RoutesWithProvenance(app, fakePool(), {
    resolveGeography: async () => {
      throw new Error("IGN timeout");
    },
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => {
      throw new Error("ne doit pas être appelée");
    },
    loadStationMeasurements: async () => [],
    now: () => now,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(payload.location.department, null);
  assert.equal(payload.provenance.values.municipality.status, "unavailable");
  assert.equal(payload.provenance.values.department.source, null);
  assert.equal(payload.provenance.values.altitude.nature, "unavailable");
  assert.equal(payload.provenance.values.alert.status, "unavailable");
  await app.close();
});
