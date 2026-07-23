import type {
  EssentialWeather,
  GeographyResolution,
  LiveWeatherData,
  LocationsResponse,
  TemperatureResolution,
  WeatherCoordinates,
} from "./contracts";

export class WeatherApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WeatherApiError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new WeatherApiError(
      response.status === 503
        ? "Les données météo sont temporairement indisponibles."
        : "Impossible de charger la météo.",
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function fetchLocations(signal?: AbortSignal): Promise<LocationsResponse> {
  return getJson<LocationsResponse>("/api/v1/meteo/locations", signal);
}

export function fetchEssentialWeather(
  coordinates: WeatherCoordinates,
  signal?: AbortSignal,
): Promise<EssentialWeather> {
  const query = new URLSearchParams({
    lat: String(coordinates.latitude),
    lon: String(coordinates.longitude),
  });
  if (coordinates.accuracyM !== undefined) {
    query.set("accuracyM", String(Math.round(coordinates.accuracyM)));
  }
  return getJson<EssentialWeather>(`/api/v1/meteo/essential?${query}`, signal);
}

function gatewayQuery(coordinates: WeatherCoordinates, positionSource: "browser-geolocation" | "manual" | "unknown") {
  const query = new URLSearchParams({ lat: String(coordinates.latitude), lon: String(coordinates.longitude), positionSource });
  if (coordinates.accuracyM !== undefined) query.set("horizontalAccuracyMeters", String(Math.round(coordinates.accuracyM)));
  return query;
}

export async function fetchLiveWeather(
  coordinates: WeatherCoordinates,
  positionSource: "browser-geolocation" | "manual" | "unknown",
  signal?: AbortSignal,
): Promise<LiveWeatherData> {
  const query = gatewayQuery(coordinates, positionSource).toString();
  const [geography, temperature] = await Promise.allSettled([
    getJson<GeographyResolution>(`/api/v2/geography/resolve?${query}`, signal),
    getJson<TemperatureResolution>(`/api/v2/weather/temperature?${query}`, signal),
  ]);
  if (temperature.status === "rejected") throw temperature.reason;
  return { geography: geography.status === "fulfilled" ? geography.value : null, temperature: temperature.value };
}
