export interface GeographyConfig {
  host: string;
  port: number;
  territoryUpstreamUrl: string;
  reverseGeocodingUpstreamUrl: string;
  elevationUpstreamUrl: string;
  territoryTimeoutMs: number;
  reverseGeocodingTimeoutMs: number;
  elevationTimeoutMs: number;
  globalTimeoutMs: number;
  version: string;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} doit être un entier strictement positif`);
  return parsed;
}

function httpUrl(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${name} doit utiliser HTTP ou HTTPS`);
  return url.toString().replace(/\/$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GeographyConfig {
  const config = {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    territoryUpstreamUrl: httpUrl(env.TERRITORY_UPSTREAM_URL?.trim() || "https://geo.api.gouv.fr", "TERRITORY_UPSTREAM_URL"),
    reverseGeocodingUpstreamUrl: httpUrl(env.REVERSE_GEOCODING_UPSTREAM_URL?.trim() || "https://data.geopf.fr/geocodage", "REVERSE_GEOCODING_UPSTREAM_URL"),
    elevationUpstreamUrl: httpUrl(env.ELEVATION_UPSTREAM_URL?.trim() || "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json", "ELEVATION_UPSTREAM_URL"),
    territoryTimeoutMs: positiveInteger(env.TERRITORY_TIMEOUT_MS, 2_000, "TERRITORY_TIMEOUT_MS"),
    reverseGeocodingTimeoutMs: positiveInteger(env.REVERSE_GEOCODING_TIMEOUT_MS, 2_000, "REVERSE_GEOCODING_TIMEOUT_MS"),
    elevationTimeoutMs: positiveInteger(env.ELEVATION_TIMEOUT_MS, 2_000, "ELEVATION_TIMEOUT_MS"),
    globalTimeoutMs: positiveInteger(env.GEOGRAPHY_GLOBAL_TIMEOUT_MS, 2_500, "GEOGRAPHY_GLOBAL_TIMEOUT_MS"),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",
  };
  if (config.globalTimeoutMs < Math.max(config.territoryTimeoutMs, config.reverseGeocodingTimeoutMs, config.elevationTimeoutMs)) {
    throw new Error("GEOGRAPHY_GLOBAL_TIMEOUT_MS doit être au moins égal aux délais fournisseurs");
  }
  return config;
}
