export interface VigilanceConfig {
  host: string; port: number; apiBaseUrl: string; cardUrl: string; bulletinUrl: string; apiToken: string | undefined;
  refreshSeconds: number; staleAfterSeconds: number; expireAfterSeconds: number; connectTimeoutMs: number; readTimeoutMs: number;
  maxRetries: number; maxResponseBytes: number; circuitBreakerFailures: number; circuitBreakerResetSeconds: number; snapshotPath: string;
  version: string; commit: string; builtAt: string | null; smokeTest: boolean;
}
function positiveInteger(value: string | undefined, fallback: number, name: string): number { if (!value?.trim()) return fallback; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} doit être un entier strictement positif`); return parsed; }
function nonNegativeInteger(value: string | undefined, fallback: number, name: string): number { if (!value?.trim()) return fallback; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} doit être un entier positif ou nul`); return parsed; }
function httpUrl(value: string, name: string): string { const parsed = new URL(value); if (!/^https?:$/.test(parsed.protocol)) throw new Error(`${name} doit utiliser HTTP ou HTTPS`); return parsed.toString().replace(/\/$/, ""); }
function boolean(value: string | undefined): boolean { return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? ""); }
export function loadConfig(env: NodeJS.ProcessEnv = process.env): VigilanceConfig {
  const apiBaseUrl = httpUrl(env.METEOFRANCE_VIGILANCE_API_URL?.trim() || "https://public-api.meteofrance.fr/public/DPVigilance/v1", "METEOFRANCE_VIGILANCE_API_URL");
  const staleAfterSeconds = positiveInteger(env.VIGILANCE_STALE_AFTER_SECONDS, 900, "VIGILANCE_STALE_AFTER_SECONDS");
  const expireAfterSeconds = positiveInteger(env.VIGILANCE_EXPIRE_AFTER_SECONDS, 21_600, "VIGILANCE_EXPIRE_AFTER_SECONDS");
  if (expireAfterSeconds <= staleAfterSeconds) throw new Error("VIGILANCE_EXPIRE_AFTER_SECONDS doit être supérieur à VIGILANCE_STALE_AFTER_SECONDS");
  const commit = env.GIT_SHA?.trim() || env.APP_VERSION?.trim() || "dev";
  return {
    host: env.HOST?.trim() || "0.0.0.0", port: positiveInteger(env.PORT, 3000, "PORT"), apiBaseUrl,
    cardUrl: httpUrl(env.METEOFRANCE_VIGILANCE_CARD_URL?.trim() || `${apiBaseUrl}/cartevigilance/encours`, "METEOFRANCE_VIGILANCE_CARD_URL"),
    bulletinUrl: httpUrl(env.METEOFRANCE_VIGILANCE_BULLETIN_URL?.trim() || `${apiBaseUrl}/bulletinvigilance/encours`, "METEOFRANCE_VIGILANCE_BULLETIN_URL"),
    apiToken: env.METEOFRANCE_VIGILANCE_API_TOKEN?.trim() || env.METEOFRANCE_API_TOKEN_VIGILANCE?.trim() || undefined,
    refreshSeconds: positiveInteger(env.VIGILANCE_REFRESH_SECONDS, 300, "VIGILANCE_REFRESH_SECONDS"), staleAfterSeconds, expireAfterSeconds,
    connectTimeoutMs: positiveInteger(env.VIGILANCE_CONNECT_TIMEOUT_MS, 3_000, "VIGILANCE_CONNECT_TIMEOUT_MS"), readTimeoutMs: positiveInteger(env.VIGILANCE_READ_TIMEOUT_MS, 10_000, "VIGILANCE_READ_TIMEOUT_MS"),
    maxRetries: nonNegativeInteger(env.VIGILANCE_MAX_RETRIES, 2, "VIGILANCE_MAX_RETRIES"), maxResponseBytes: positiveInteger(env.VIGILANCE_MAX_RESPONSE_BYTES, 8_388_608, "VIGILANCE_MAX_RESPONSE_BYTES"),
    circuitBreakerFailures: positiveInteger(env.VIGILANCE_CIRCUIT_BREAKER_FAILURES, 3, "VIGILANCE_CIRCUIT_BREAKER_FAILURES"), circuitBreakerResetSeconds: positiveInteger(env.VIGILANCE_CIRCUIT_BREAKER_RESET_SECONDS, 300, "VIGILANCE_CIRCUIT_BREAKER_RESET_SECONDS"),
    snapshotPath: env.VIGILANCE_SNAPSHOT_PATH?.trim() || "/app/data/vigilance-snapshot.json", version: env.APP_VERSION?.trim() || commit.slice(0, 7), commit, builtAt: env.BUILT_AT?.trim() || null, smokeTest: boolean(env.SMOKE_TEST_METEOFRANCE),
  };
}
