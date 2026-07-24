export interface FireDetectionConfig {
  host: string;
  port: number;
  version: string;
  commit: string;
  builtAt: string;
  firmsMapKey: string;
  firmsApiBaseUrl: string;
  firmsTimeoutMs: number;
  firmsMaxRetries: number;
  maxResponseBytes: number;
  defaultRadiusKm: number;
  maxRadiusKm: number;
  historyDays: number;
  realtimeWindowMinutes: number;
  cacheSeconds: number;
  eumetsatConsumerKey: string;
  eumetsatConsumerSecret: string;
  eumetsatTokenUrl: string;
  eumetsatSearchUrl: string;
  eumetsatBrowseUrl: string;
  eumetsatDownloadUrl: string;
  eumetsatMtgCollection: string;
  eumetsatMsgCollection: string;
  eumetsatTimeoutMs: number;
  eumetsatMaxProducts: number;
}

function integer(value: string | undefined, fallback: number, name: string, minimum = 0): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${name} doit être un entier >= ${minimum}`);
  return parsed;
}
function number(value: string | undefined, fallback: number, name: string, minimum: number, maximum: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} doit être compris entre ${minimum} et ${maximum}`);
  return parsed;
}
function url(value: string | undefined, fallback: string, name: string): string {
  const parsed = new URL(value?.trim() || fallback);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${name} doit utiliser HTTP ou HTTPS`);
  return parsed.toString().replace(/\/$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FireDetectionConfig {
  const defaultRadiusKm = number(env.FIRE_DEFAULT_RADIUS_KM, 50, "FIRE_DEFAULT_RADIUS_KM", 1, 100);
  const maxRadiusKm = number(env.FIRE_MAX_RADIUS_KM, 100, "FIRE_MAX_RADIUS_KM", defaultRadiusKm, 500);
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: integer(env.PORT, 3000, "PORT", 1),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.slice(0, 7) || "dev",
    commit: env.GIT_SHA?.trim() || "unknown",
    builtAt: env.BUILT_AT?.trim() || "unknown",
    firmsMapKey: env.NASA_FIRMS_MAP_KEY?.trim() || "",
    firmsApiBaseUrl: url(env.FIRMS_API_BASE_URL, "https://firms.modaps.eosdis.nasa.gov/api/area/csv", "FIRMS_API_BASE_URL"),
    firmsTimeoutMs: integer(env.FIRMS_TIMEOUT_MS, 8_000, "FIRMS_TIMEOUT_MS", 100),
    firmsMaxRetries: integer(env.FIRMS_MAX_RETRIES, 1, "FIRMS_MAX_RETRIES", 0),
    maxResponseBytes: integer(env.FIRE_MAX_RESPONSE_BYTES, 5_000_000, "FIRE_MAX_RESPONSE_BYTES", 1_024),
    defaultRadiusKm,
    maxRadiusKm,
    historyDays: integer(env.FIRE_HISTORY_DAYS, 7, "FIRE_HISTORY_DAYS", 1),
    realtimeWindowMinutes: integer(env.FIRE_REALTIME_WINDOW_MINUTES, 90, "FIRE_REALTIME_WINDOW_MINUTES", 10),
    cacheSeconds: integer(env.FIRE_CACHE_SECONDS, 45, "FIRE_CACHE_SECONDS", 0),
    eumetsatConsumerKey: env.EUMETSAT_CONSUMER_KEY?.trim() || "",
    eumetsatConsumerSecret: env.EUMETSAT_CONSUMER_SECRET?.trim() || "",
    eumetsatTokenUrl: url(env.EUMETSAT_TOKEN_URL, "https://api.eumetsat.int/token", "EUMETSAT_TOKEN_URL"),
    eumetsatSearchUrl: url(env.EUMETSAT_SEARCH_URL, "https://api.eumetsat.int/data/search-products/1.0.0/os", "EUMETSAT_SEARCH_URL"),
    eumetsatBrowseUrl: url(env.EUMETSAT_BROWSE_URL, "https://api.eumetsat.int/data/browse", "EUMETSAT_BROWSE_URL"),
    eumetsatDownloadUrl: url(env.EUMETSAT_DOWNLOAD_URL, "https://api.eumetsat.int/data/download/1.0.0", "EUMETSAT_DOWNLOAD_URL"),
    eumetsatMtgCollection: env.EUMETSAT_MTG_FIRE_COLLECTION?.trim() || "EO:EUM:DAT:0801",
    eumetsatMsgCollection: env.EUMETSAT_MSG_FIRE_COLLECTION?.trim() || "EO:EUM:DAT:MSG:FIRC",
    eumetsatTimeoutMs: integer(env.EUMETSAT_TIMEOUT_MS, 10_000, "EUMETSAT_TIMEOUT_MS", 100),
    eumetsatMaxProducts: integer(env.EUMETSAT_MAX_PRODUCTS, 24, "EUMETSAT_MAX_PRODUCTS", 1),
  };
}
