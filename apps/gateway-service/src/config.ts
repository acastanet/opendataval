export interface GatewayConfig {
  host: string;
  port: number;
  legacyApiUrl: string;
  upstreamTimeoutMs: number;
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
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",
  };
}
