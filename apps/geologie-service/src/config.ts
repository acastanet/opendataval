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
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${name} doit utiliser HTTP ou HTTPS`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function boolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export interface GeologieConfig {
  host: string;
  port: number;
  version: string;

  brgmWfsUrl: string;
  brgmTimeoutMs: number;
  brgmMaxFeatures: number;

  cacheTtlSeconds: number;
  cacheMaxEntries: number;

  llmUrl: string;
  llmModel: string;
  /** Vide = reranking désactivé, repli direct sur le classement déterministe. */
  llmApiKey: string;
  llmTimeoutMs: number;
  llmMaxTokens: number;

  llmVisionModel: string;
  llmVisionTimeoutMs: number;
  llmSyntheseMaxTokens: number;

  infoterreTimeoutMs: number;
  infoterreMaxScanBytes: number;
  infoterreImageWidthPx: number;

  debugEnabled: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GeologieConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",

    brgmWfsUrl: httpUrl(
      env.GEOLOGIE_BRGM_WFS_URL,
      "https://mapsref.brgm.fr/wxs/infoterre/catalogue",
      "GEOLOGIE_BRGM_WFS_URL",
    ),
    brgmTimeoutMs: positiveInteger(env.GEOLOGIE_BRGM_TIMEOUT_MS, 20_000, "GEOLOGIE_BRGM_TIMEOUT_MS"),
    brgmMaxFeatures: positiveInteger(env.GEOLOGIE_BRGM_MAX_FEATURES, 500, "GEOLOGIE_BRGM_MAX_FEATURES"),

    cacheTtlSeconds: positiveInteger(env.GEOLOGIE_CACHE_TTL_SECONDS, 21_600, "GEOLOGIE_CACHE_TTL_SECONDS"),
    cacheMaxEntries: positiveInteger(env.GEOLOGIE_CACHE_MAX_ENTRIES, 200, "GEOLOGIE_CACHE_MAX_ENTRIES"),

    llmUrl: httpUrl(
      env.GEOLOGIE_LLM_URL,
      "https://llm.ilaas.fr/v1/chat/completions",
      "GEOLOGIE_LLM_URL",
    ),
    llmModel: env.GEOLOGIE_LLM_MODEL?.trim() || "mistral-medium-latest",
    llmApiKey: env.GEOLOGIE_LLM_API_KEY?.trim() || "",
    llmTimeoutMs: positiveInteger(env.GEOLOGIE_LLM_TIMEOUT_MS, 20_000, "GEOLOGIE_LLM_TIMEOUT_MS"),
    llmMaxTokens: positiveInteger(env.GEOLOGIE_LLM_MAX_TOKENS, 1_500, "GEOLOGIE_LLM_MAX_TOKENS"),

    llmVisionModel: env.GEOLOGIE_LLM_VISION_MODEL?.trim() || "mistral-medium-latest",
    llmVisionTimeoutMs: positiveInteger(env.GEOLOGIE_LLM_VISION_TIMEOUT_MS, 45_000, "GEOLOGIE_LLM_VISION_TIMEOUT_MS"),
    llmSyntheseMaxTokens: positiveInteger(env.GEOLOGIE_LLM_SYNTHESE_MAX_TOKENS, 700, "GEOLOGIE_LLM_SYNTHESE_MAX_TOKENS"),

    infoterreTimeoutMs: positiveInteger(env.GEOLOGIE_INFOTERRE_TIMEOUT_MS, 15_000, "GEOLOGIE_INFOTERRE_TIMEOUT_MS"),
    infoterreMaxScanBytes: positiveInteger(
      env.GEOLOGIE_INFOTERRE_MAX_SCAN_BYTES,
      5_000_000,
      "GEOLOGIE_INFOTERRE_MAX_SCAN_BYTES",
    ),
    infoterreImageWidthPx: positiveInteger(
      env.GEOLOGIE_INFOTERRE_IMAGE_WIDTH_PX,
      1_400,
      "GEOLOGIE_INFOTERRE_IMAGE_WIDTH_PX",
    ),

    debugEnabled: boolean(env.GEOLOGIE_DEBUG_ENABLED, false),
  };
}
