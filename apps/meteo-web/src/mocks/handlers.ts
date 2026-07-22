import { delay, http, HttpResponse } from "msw";
import type { WeatherCoordinates } from "../api/contracts";
import { essentialWeatherFixture, locations, resolvedLocationFixture } from "./fixtures";

export const handlers = [
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
