export interface GatewayConfig {
  host: string;
  port: number;
  legacyApiUrl: string;
  upstreamTimeoutMs: number;
  geographyServiceUrl: string;
  geographyServiceTimeoutMs: number;
  weatherServiceUrl: string;
  weatherServiceTimeoutMs: number;
  vigilanceServiceUrl?: string;
  vigilanceServiceTimeoutMs?: number;
  fireDetectionServiceUrl?: string;
  fireDetectionServiceTimeoutMs?: number;
  associationServiceUrl?: string;
  associationServiceTimeoutMs?: number;
  mapServiceUrl?: string;
  version: string;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} doit être un entier strictement positif`);
  }
  return parsed;
}

function normalizeHttpUrl(value: string, name: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} doit utiliser le protocole HTTP ou HTTPS`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    legacyApiUrl: normalizeHttpUrl(
      env.LEGACY_API_URL?.trim() || "http://api:3000",
      "LEGACY_API_URL",
    ),
    upstreamTimeoutMs: positiveInteger(
      env.GATEWAY_UPSTREAM_TIMEOUT_MS,
      5_000,
      "GATEWAY_UPSTREAM_TIMEOUT_MS",
    ),
    geographyServiceUrl: normalizeHttpUrl(
      env.GEOGRAPHY_SERVICE_URL?.trim() || "http://geography-service:3000",
      "GEOGRAPHY_SERVICE_URL",
    ),
    geographyServiceTimeoutMs: positiveInteger(
      env.GEOGRAPHY_SERVICE_TIMEOUT_MS,
      3_000,
      "GEOGRAPHY_SERVICE_TIMEOUT_MS",
    ),
    weatherServiceUrl: normalizeHttpUrl(
      env.WEATHER_SERVICE_URL?.trim() || "http://weather-service:3000",
      "WEATHER_SERVICE_URL",
    ),
    weatherServiceTimeoutMs: positiveInteger(
      env.WEATHER_SERVICE_TIMEOUT_MS,
      3_000,
      "WEATHER_SERVICE_TIMEOUT_MS",
    ),
    vigilanceServiceUrl: normalizeHttpUrl(
      env.VIGILANCE_SERVICE_URL?.trim() || "http://weather-vigilance-service:3000",
      "VIGILANCE_SERVICE_URL",
    ),
    vigilanceServiceTimeoutMs: positiveInteger(
      env.VIGILANCE_SERVICE_TIMEOUT_MS,
      3_000,
      "VIGILANCE_SERVICE_TIMEOUT_MS",
    ),
    fireDetectionServiceUrl: normalizeHttpUrl(
      env.FIRE_DETECTION_SERVICE_URL?.trim() || "http://fire-detection-service:3000",
      "FIRE_DETECTION_SERVICE_URL",
    ),
    fireDetectionServiceTimeoutMs: positiveInteger(
      env.FIRE_DETECTION_SERVICE_TIMEOUT_MS,
      20_000,
      "FIRE_DETECTION_SERVICE_TIMEOUT_MS",
    ),
    associationServiceUrl: normalizeHttpUrl(
      env.ASSOCIATION_SERVICE_URL?.trim() || "http://association-service:3000",
      "ASSOCIATION_SERVICE_URL",
    ),
    associationServiceTimeoutMs: positiveInteger(
      env.ASSOCIATION_SERVICE_TIMEOUT_MS,
      5_000,
      "ASSOCIATION_SERVICE_TIMEOUT_MS",
    ),
    mapServiceUrl: normalizeHttpUrl(
      env.MAP_SERVICE_URL?.trim() || "http://map-service:3000",
      "MAP_SERVICE_URL",
    ),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",
  };
}
