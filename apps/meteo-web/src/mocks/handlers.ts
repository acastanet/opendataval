import { delay, http, HttpResponse } from "msw";
import type { WeatherCoordinates } from "../api/contracts";
import { essentialWeatherFixture, locations, resolvedLocationFixture } from "./fixtures";

export const handlers = [
  http.get("*/api/v2/geography/resolve", async ({ request }) => {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return HttpResponse.json({ error: { message: "coordonnées invalides" } }, { status: 400 });
    }
    await delay(180);
    return HttpResponse.json({
      query: { latitude, longitude, positionSource: url.searchParams.get("positionSource") ?? "manual" },
      territory: { status: "available", data: { label: "Territoire Val-d'Aigoual", commune: { name: "Val-d'Aigoual", inseeCode: "30339" }, department: { name: "Gard", code: "30" } } },
      address: { status: "available", data: { formatted: "Rue de la Mairie, 30570 Val-d'Aigoual", precision: "street", distanceMeters: 18 } },
      elevation: { status: "available", data: { meters: 351 } }, requestId: "mock-geography",
    });
  }),

  http.get("*/api/v2/weather/temperature", async ({ request }) => {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return HttpResponse.json({ error: { message: "coordonnées invalides" } }, { status: 400 });
    }
    await delay(250);
    return HttpResponse.json({
      location: { latitude, longitude, altitudeMeters: 351 },
      temperature: { valueCelsius: 37.4, nature: "station_observation", referenceTime: new Date().toISOString(), ageMinutes: 12, stale: false, quality: "good" },
      stationSelection: { status: "selected", selectedStation: { name: "Le Vigan", network: "meteofrance", distanceKilometers: 10.4, altitudeDifferenceMeters: 100 } },
      provenance: { source: { provider: "Météo-France", product: "DPObs" } }, degraded: false, unavailableSources: [], requestId: "mock-weather",
    });
  }),

  http.get("*/api/v2/vigilance", async ({ request }) => {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return HttpResponse.json({ error: { message: "coordonnées invalides" } }, { status: 400 });
    }
    await delay(220);
    return HttpResponse.json({
      service: "weather-vigilance", version: "1.0.0", data_status: "available", freshness_status: "fresh", geographic_scope: "department",
      location: { department_code: "30", department_name: "Gard", resolved_by: "geography-service" },
      periods: [{ day: "today", overall_level: { code: "green", label: "Pas de vigilance particulière" }, phenomena: [] }], bulletins: [],
      source: { name: "Météo-France", product: "Vigilance météorologique", issued_at: new Date().toISOString(), retrieved_at: new Date().toISOString() },
      cache: { status: "hit", age_seconds: 90 }, warnings: [], requestId: "mock-vigilance",
    });
  }),

  http.get("*/api/v1/meteo/locations", async () => {
    await delay(180);
    return HttpResponse.json({ locations });
  }),

  http.get("*/api/v1/meteo/location", async ({ request }) => {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return HttpResponse.json({ error: "coordonnées lat/lon invalides" }, { status: 400 });
    }
    await delay(180);
    return HttpResponse.json(resolvedLocationFixture({ latitude, longitude }));
  }),

  http.get("*/api/v1/meteo/essential", async ({ request }) => {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    const accuracy = url.searchParams.get("accuracyM");

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return HttpResponse.json(
        { error: "coordonnées lat/lon invalides" },
        { status: 400 },
      );
    }

    const coordinates: WeatherCoordinates = {
      latitude,
      longitude,
      ...(accuracy === null ? {} : { accuracyM: Number(accuracy) }),
    };
    await delay(260);
    return HttpResponse.json(essentialWeatherFixture(coordinates));
  }),
];
