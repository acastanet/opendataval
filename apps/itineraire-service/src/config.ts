function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} doit être un entier strictement positif`);
  return parsed;
}

function httpUrl(value: string | undefined, fallback: string, name: string): string {
  const parsed = new URL(value?.trim() || fallback);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${name} doit utiliser HTTP ou HTTPS`);
  return parsed.toString().replace(/\/$/, "");
}

export interface ItineraireConfig {
  host: string;
  port: number;
  version: string;
  valhallaUrl: string;
  valhallaTimeoutMs: number;
  restrictionsFile: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ItineraireConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",
    valhallaUrl: httpUrl(env.VALHALLA_URL, "http://valhalla:8002", "VALHALLA_URL"),
    valhallaTimeoutMs: positiveInteger(env.VALHALLA_TIMEOUT_MS, 25_000, "VALHALLA_TIMEOUT_MS"),
    restrictionsFile: env.ITINERAIRE_RESTRICTIONS_FILE?.trim() || "/var/lib/opendataval/itineraire-service/restrictions.json",
  };
}
