import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type pg from "pg";
import { registerMeteoV1Routes } from "./meteo-v1.js";
import type { ResolvedGeography } from "../lib/geography.js";

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
