import assert from "node:assert/strict";
import test from "node:test";
import { selectStationObservation } from "../src/policies/station-selection-policy.js";
import { buildApp } from "../src/app.js";

const config = {
  host: "127.0.0.1", port: 3000, databaseUrl: undefined, geographyServiceUrl: "http://geo", weatherModelUrl: "http://model",
  geographyTimeoutMs: 1500, databaseTimeoutMs: 1000, weatherModelTimeoutMs: 2000, globalTimeoutMs: 2500, version: "test",
};
const station = { id: "a", nom: "Station", lat: 44.08, lon: 3.64, altitudeM: 366, reseau: "meteofrance" as const, licence: "Licence Ouverte 2.0" };

test("sélectionne la meilleure observation valide", () => {
  const result = selectStationObservation(
    { latitude: 44.081, longitude: 3.641, altitudeM: 366 },
    [{ station, temperatureC: 23.44, observedAt: "2026-07-23T14:00:00.000Z" }],
    new Date("2026-07-23T14:12:00.000Z"),
  );
  assert.equal(result.status, "selected");
  assert.equal(result.selected?.temperatureC, 23.44);
});

test("ajuste une observation par le delta du modèle entre station et point", async () => {
  const app = buildApp({
    config,
    logger: false,
    dependencies: {
      geography: async () => ({ latitude: 44.081, longitude: 3.641, altitudeMeters: 450 }),
      observations: async () => [{ station, temperatureC: 18, observedAt: "2026-07-23T14:00:00.000Z" }],
      model: async (lat, _lon, validAt) => validAt
        ? { valueCelsius: lat === station.lat ? 17 : 15, referenceTime: "2026-07-23T14:00:00.000Z" }
        : { valueCelsius: 15, referenceTime: "2026-07-23T14:00:00.000Z" },
      now: () => new Date("2026-07-23T14:12:00.000Z"),
    },
  });
  const response = await app.inject({ url: "/internal/v1/weather/temperature?lat=44.081&lon=3.641" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.temperature.valueCelsius, 16);
  assert.equal(body.temperature.nature, "station_adjusted_by_model");
  assert.deepEqual(body.temperature.adjustment, {
    modelAtPointCelsius: 15,
    modelAtStationCelsius: 17,
    deltaCelsius: -2,
    modelReferenceTime: "2026-07-23T14:00:00.000Z",
  });
  assert.equal(body.method.version, "2");
  await app.close();
});

test("conserve la mesure brute quand la correction modèle échoue", async () => {
  const app = buildApp({
    config,
    logger: false,
    dependencies: {
      geography: async () => ({ latitude: 44.081, longitude: 3.641, altitudeMeters: 450 }),
      observations: async () => [{ station, temperatureC: 18, observedAt: "2026-07-23T14:00:00.000Z" }],
      model: async (_lat, _lon, validAt) => {
        if (validAt) throw new Error("modèle horaire indisponible");
        return { valueCelsius: 15, referenceTime: "2026-07-23T14:00:00.000Z" };
      },
      now: () => new Date("2026-07-23T14:12:00.000Z"),
    },
  });
  const response = await app.inject({ url: "/internal/v1/weather/temperature?lat=44.081&lon=3.641" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().temperature.nature, "station_observation");
  assert.equal(response.json().temperature.valueCelsius, 18);
  assert.deepEqual(response.json().unavailableSources, ["model_correction"]);
  await app.close();
});

test("route retourne le fallback modèle avec request id", async () => {
  const app = buildApp({
    config,
    logger: false,
    dependencies: {
      geography: async () => ({ latitude: 44.081, longitude: 3.641, altitudeMeters: null }),
      observations: async () => [],
      model: async () => ({ valueCelsius: 22.8, referenceTime: "2026-07-23T14:00:00.000Z" }),
      now: () => new Date("2026-07-23T14:12:00.000Z"),
    },
  });
  const response = await app.inject({ url: "/internal/v1/weather/temperature?lat=44.081&lon=3.641", headers: { "x-request-id": "req-123" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().temperature.nature, "model_at_point");
  assert.equal(response.json().requestId, "req-123");
  await app.close();
});
