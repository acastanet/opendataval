import type { FetchLike } from "./geography-client.js";

export interface ModelTemperature {
  valueCelsius: number;
  referenceTime: string;
}

const MAX_MODEL_TIME_OFFSET_MS = 45 * 60 * 1_000;

function modelTemperature(value: unknown, time: unknown): ModelTemperature {
  const valueCelsius = Number(value);
  const timestamp = Number(time);
  if (!Number.isFinite(valueCelsius)) throw new Error("température modèle invalide");
  return {
    valueCelsius: Math.round(valueCelsius * 10) / 10,
    referenceTime: Number.isFinite(timestamp)
      ? new Date(timestamp * 1_000).toISOString()
      : new Date().toISOString(),
  };
}

async function requestModel(
  baseUrl: string,
  latitude: number,
  longitude: number,
  timeoutMs: number,
  fetchImpl: FetchLike,
  configure: (url: URL) => void,
): Promise<unknown> {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "Europe/Paris");
  url.searchParams.set("timeformat", "unixtime");
  configure(url);
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`weather model HTTP ${response.status}`);
  return response.json();
}

/** Température courante du modèle, utilisée lorsque aucune station n'est exploitable. */
export async function getModelTemperature(
  baseUrl: string,
  latitude: number,
  longitude: number,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<ModelTemperature> {
  const body = await requestModel(baseUrl, latitude, longitude, timeoutMs, fetchImpl, (url) => {
    url.searchParams.set("current", "temperature_2m");
  });
  const current = body && typeof body === "object"
    ? (body as { current?: { temperature_2m?: unknown; time?: unknown } }).current
    : undefined;
  return modelTemperature(current?.temperature_2m, current?.time);
}

/**
 * Température modèle au pas horaire le plus proche de l'observation. Le même
 * instant est demandé pour le point cible et la station afin de pouvoir en
 * appliquer le delta spatial sans mélanger deux situations météorologiques.
 */
export async function getModelTemperatureAt(
  baseUrl: string,
  latitude: number,
  longitude: number,
  validAt: string,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<ModelTemperature> {
  const expectedAt = Date.parse(validAt);
  if (!Number.isFinite(expectedAt)) throw new Error("instant modèle invalide");
  const body = await requestModel(baseUrl, latitude, longitude, timeoutMs, fetchImpl, (url) => {
    url.searchParams.set("hourly", "temperature_2m");
    url.searchParams.set("past_hours", "3");
    url.searchParams.set("forecast_hours", "1");
  });
  const hourly = body && typeof body === "object"
    ? (body as { hourly?: { time?: unknown; temperature_2m?: unknown } }).hourly
    : undefined;
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly.temperature_2m)) {
    throw new Error("série horaire modèle invalide");
  }

  let closest: { value: unknown; timestamp: number; offset: number } | null = null;
  for (let index = 0; index < hourly.time.length; index += 1) {
    const timestamp = Number(hourly.time[index]) * 1_000;
    const value = hourly.temperature_2m[index];
    const offset = Math.abs(timestamp - expectedAt);
    if (Number.isFinite(timestamp) && Number.isFinite(Number(value)) && (!closest || offset < closest.offset)) {
      closest = { value, timestamp, offset };
    }
  }
  if (!closest || closest.offset > MAX_MODEL_TIME_OFFSET_MS) {
    throw new Error("créneau modèle incompatible avec l'observation");
  }
  return modelTemperature(closest.value, closest.timestamp / 1_000);
}
