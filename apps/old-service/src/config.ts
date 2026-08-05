function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} doit être un entier strictement positif`);
  }
  return parsed;
}

function httpUrl(value: string | undefined, fallback: string, name: string): string {
  const parsed = new URL(value?.trim() || fallback);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} doit utiliser HTTP ou HTTPS`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export interface OldConfig {
  host: string;
  port: number;
  version: string;
  apiCartoUrl: string;
  wfsUrl: string;
  upstreamTimeoutMs: number;
  buildingSearchRadiusMeters: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OldConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",
    apiCartoUrl: httpUrl(
      env.OLD_API_CARTO_URL,
      "https://apicarto.ign.fr/api",
      "OLD_API_CARTO_URL",
    ),
    wfsUrl: httpUrl(
      env.OLD_WFS_URL,
      "https://data.geopf.fr/wfs/ows",
      "OLD_WFS_URL",
    ),
    upstreamTimeoutMs: positiveInteger(
      env.OLD_UPSTREAM_TIMEOUT_MS,
      10_000,
      "OLD_UPSTREAM_TIMEOUT_MS",
    ),
    buildingSearchRadiusMeters: positiveInteger(
      env.OLD_BUILDING_SEARCH_RADIUS_METERS,
      75,
      "OLD_BUILDING_SEARCH_RADIUS_METERS",
    ),
  };
}
