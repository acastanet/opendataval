import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type pg from "pg";
import { registerMeteoV1Routes } from "./meteo-v1.js";
import type { ResolvedGeography } from "../lib/geography.js";
import type { StationMeasurement } from "../lib/station-observations.js";

const paris: ResolvedGeography = {
  coordinates: { latitude: 48.8566, longitude: 2.3522 },
  label: "Paris",
  municipality: { name: "Paris", inseeCode: "75056" },
  department: { name: "Paris", code: "75" },
  altitudeM: 35,
  resolution: { administrative: "ign", altitude: "ign" },
  unavailableSources: [],
  generatedAt: "2026-07-22T12:00:00.000Z",
};

const valAigoual: ResolvedGeography = {
  coordinates: { latitude: 44.081192, longitude: 3.641467 },
  label: "Val-d’Aigoual",
  municipality: { name: "Val-d’Aigoual", inseeCode: "30339" },
  department: { name: "Gard", code: "30" },
  altitudeM: 354,
  resolution: { administrative: "ign", altitude: "ign" },
  unavailableSources: [],
  generatedAt: "2026-07-22T12:00:00.000Z",
};

const weatherData = {
  current: {
    time: "2026-07-22T14:00",
    temperature_2m: 25.3,
    apparent_temperature: 25.8,
    weather_code: 1,
  },
  hourly: {
    temperature_2m: [25.3, 25.8, 26.1],
    precipitation_probability: [0, 10, 10],
    wind_gusts_10m: [10, 12, 13],
    weather_code: [1, 1, 2],
  },
  daily: {
    temperature_2m_max: [27],
    temperature_2m_min: [18],
  },
};

function fakePool(): pg.Pool {
  return { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
}

test("GET /location expose la commune, le département et l’altitude résolus", async () => {
  const app = Fastify();
  registerMeteoV1Routes(app, fakePool(), {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => ({
      niveau: "green",
      phenomenes: [],
      miseAJour: new Date(),
      indisponible: false,
    }),
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/location?lat=48.8566&lon=2.3522",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().municipality.inseeCode, "75056");
  assert.equal(response.json().department.code, "75");
  assert.equal(response.json().altitudeM, 35);
  await app.close();
});

test("essential utilise le département 75 pour la vigilance de Paris", async () => {
  const requestedDepartments: string[] = [];
  const app = Fastify();
  registerMeteoV1Routes(app, fakePool(), {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async (departmentCode) => {
      requestedDepartments.push(departmentCode);
      return {
        niveau: "yellow",
        phenomenes: ["Canicule"],
        miseAJour: new Date(),
        indisponible: false,
      };
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(requestedDepartments, ["75"]);
  assert.equal(response.json().location.department.code, "75");
  assert.equal(response.json().alert.departmentCode, "75");
  assert.equal(response.json().alert.indisponible, false);
  assert.equal(response.json().current.nature, "model");
  assert.equal(response.json().current.station, null);
  await app.close();
});

test("essential choisit la station locale représentative plutôt que le sommet", async () => {
  const now = new Date("2026-07-22T14:00:00.000Z");
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
  registerMeteoV1Routes(app, fakePool(), {
    resolveGeography: async () => valAigoual,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => ({
      niveau: "green",
      phenomenes: [],
      miseAJour: now,
      indisponible: false,
    }),
    loadStationMeasurements: async () => measurements,
    now: () => now,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=44.081192&lon=3.641467",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().current.nature, "observation");
  assert.equal(response.json().current.temperatureC, 23.4);
  assert.equal(response.json().current.station.id, "000UB");
  assert.equal(response.json().current.station.name, "Valleraugue");
  assert.match(response.json().current.sourceLabel, /reste estimé par AROME/);
  await app.close();
});

test("essential utilise le modèle hors couverture du réseau local", async () => {
  const app = Fastify();
  registerMeteoV1Routes(app, fakePool(), {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => ({
      niveau: "green",
      phenomenes: [],
      miseAJour: new Date(),
      indisponible: false,
    }),
    loadStationMeasurements: async () => [{
      station: {
        id: "000UB",
        nom: "Valleraugue",
        altitudeM: 400,
        lat: 44.0828,
        lon: 3.62148,
        reseau: "infoclimat",
        licence: "CC BY-NC 4.0",
      },
      temperatureC: 23,
      observedAt: new Date().toISOString(),
    }],
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().current.nature, "model");
  assert.equal(response.json().current.station, null);
  assert.ok(!response.json().unavailableSources.includes("Observations locales"));
  await app.close();
});

test("essential distingue une panne des observations d'une absence de station", async () => {
  const app = Fastify();
  registerMeteoV1Routes(app, fakePool(), {
    resolveGeography: async () => paris,
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => ({
      niveau: "green",
      phenomenes: [],
      miseAJour: new Date(),
      indisponible: false,
    }),
    loadStationMeasurements: async () => {
      throw new Error("database unavailable");
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().current.nature, "model");
  assert.ok(response.json().unavailableSources.includes("Observations locales"));
  await app.close();
});

test("essential reste disponible si IGN échoue et n’invente aucun département", async () => {
  let vigilanceCalled = false;
  const app = Fastify();
  registerMeteoV1Routes(app, fakePool(), {
    resolveGeography: async () => {
      throw new Error("IGN timeout");
    },
    fetchWeatherJson: async () => weatherData,
    fetchVigilance: async () => {
      vigilanceCalled = true;
      throw new Error("Ne doit pas être appelé");
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48.8566&lon=2.3522",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().location.department, null);
  assert.equal(response.json().alert.departmentCode, null);
  assert.equal(response.json().alert.indisponible, true);
  assert.equal(vigilanceCalled, false);
  assert.ok(response.json().unavailableSources.includes("Géocodage IGN"));
  await app.close();
});

test("refuse les coordonnées et précisions invalides", async () => {
  const app = Fastify();
  registerMeteoV1Routes(app, fakePool());

  const invalidCoordinates = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/location?lat=91&lon=2",
  });
  const invalidAccuracy = await app.inject({
    method: "GET",
    url: "/api/v1/meteo/essential?lat=48&lon=2&accuracyM=-1",
  });

  assert.equal(invalidCoordinates.statusCode, 400);
  assert.equal(invalidAccuracy.statusCode, 400);
  await app.close();
});
