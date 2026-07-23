export type AuthMode = "apikey" | "bearer";

export interface VigilanceConfig {
  host: string;
  port: number;
  apiBaseUrl: string;
  apiToken: string;
  authMode: AuthMode;
  refreshSeconds: number;
  staleAfterSeconds: number;
  expireAfterSeconds: number;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  maxRetries: number;
  maxResponseBytes: number;
  circuitFailureThreshold: number;
  circuitOpenSeconds: number;
  snapshotPath: string;
  version: string;
  commit: string;
  builtAt: string;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} doit être un entier strictement positif`);
  return parsed;
}

function nonNegativeInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} doit être un entier positif ou nul`);
  return parsed;
}

function httpUrl(value: string, name: string): string {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`${name} doit utiliser HTTP ou HTTPS`);
  return parsed.toString().replace(/\/$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): VigilanceConfig {
  const staleAfterSeconds = positiveInteger(env.VIGILANCE_STALE_AFTER_SECONDS, 900, "VIGILANCE_STALE_AFTER_SECONDS");
  const expireAfterSeconds = positiveInteger(env.VIGILANCE_EXPIRE_AFTER_SECONDS, 21_600, "VIGILANCE_EXPIRE_AFTER_SECONDS");
  if (expireAfterSeconds <= staleAfterSeconds) throw new Error("VIGILANCE_EXPIRE_AFTER_SECONDS doit dépasser VIGILANCE_STALE_AFTER_SECONDS");
  const authMode = (env.METEOFRANCE_VIGILANCE_AUTH_MODE?.trim().toLowerCase() || "apikey") as AuthMode;
  if (!(["apikey", "bearer"] as string[]).includes(authMode)) throw new Error("METEOFRANCE_VIGILANCE_AUTH_MODE doit valoir apikey ou bearer");
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    apiBaseUrl: httpUrl(env.METEOFRANCE_VIGILANCE_API_URL?.trim() || "https://public-api.meteofrance.fr/public/DPVigilance/v1", "METEOFRANCE_VIGILANCE_API_URL"),
    apiToken: env.METEOFRANCE_VIGILANCE_API_TOKEN?.trim() || env.METEOFRANCE_API_TOKEN_VIGILANCE?.trim() || "",
    authMode,
    refreshSeconds: positiveInteger(env.VIGILANCE_REFRESH_SECONDS, 300, "VIGILANCE_REFRESH_SECONDS"),
    staleAfterSeconds,
    expireAfterSeconds,
    connectTimeoutMs: positiveInteger(env.VIGILANCE_CONNECT_TIMEOUT_MS, 3_000, "VIGILANCE_CONNECT_TIMEOUT_MS"),
    readTimeoutMs: positiveInteger(env.VIGILANCE_READ_TIMEOUT_MS, 10_000, "VIGILANCE_READ_TIMEOUT_MS"),
    maxRetries: nonNegativeInteger(env.VIGILANCE_MAX_RETRIES, 2, "VIGILANCE_MAX_RETRIES"),
    maxResponseBytes: positiveInteger(env.VIGILANCE_MAX_RESPONSE_BYTES, 5_000_000, "VIGILANCE_MAX_RESPONSE_BYTES"),
    circuitFailureThreshold: positiveInteger(env.VIGILANCE_CIRCUIT_FAILURE_THRESHOLD, 3, "VIGILANCE_CIRCUIT_FAILURE_THRESHOLD"),
    circuitOpenSeconds: positiveInteger(env.VIGILANCE_CIRCUIT_OPEN_SECONDS, 60, "VIGILANCE_CIRCUIT_OPEN_SECONDS"),
    snapshotPath: env.VIGILANCE_SNAPSHOT_PATH?.trim() || "/app/data/vigilance-snapshot.json",
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.slice(0, 7) || "dev",
    commit: env.GIT_SHA?.trim() || "unknown",
    builtAt: env.BUILT_AT?.trim() || "unknown",
  };
}
