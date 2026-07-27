import { resolve } from "node:path";

function positive(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} doit être un entier strictement positif`);
  return parsed;
}

function httpsUrlOrNull(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export interface AssociationConfig {
  host: string;
  port: number;
  dataDir: string;
  snapshotPath: string;
  version: string;
  syncToken?: string;
  geocodingUrl: string;
  waldecSourceUrl?: string;
  importSourceUrl?: string;
  /** Ancienne variable, conservée pour la compatibilité des déploiements existants. */
  rnaSourceUrl?: string;
  /** Délai de connexion/réseau pour le téléchargement des extractions nationales. */
  downloadTimeoutMs: number;
  /** Délai d'appel du service de géocodage. */
  geocodingTimeoutMs: number;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AssociationConfig {
  const dataDir = resolve(
    env.ASSOCIATION_DATA_DIR?.trim() ||
      "/var/lib/opendataval/association-service",
  );
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positive(env.PORT, 3000, "PORT"),
    dataDir,
    snapshotPath: resolve(dataDir, "associations-30339.json.gz"),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",
    syncToken: env.ASSOCIATION_SYNC_TOKEN?.trim() || undefined,
    geocodingUrl:
      env.ASSOCIATION_GEOCODING_URL?.trim() ||
      "https://data.geopf.fr/geocodage/search",
    waldecSourceUrl: httpsUrlOrNull(env.RNA_WALDEC_SOURCE_URL),
    importSourceUrl: httpsUrlOrNull(env.RNA_IMPORT_SOURCE_URL),
    // RNA_SOURCE_URL reste accepté pour les fixtures/anciens déploiements.
    rnaSourceUrl: httpsUrlOrNull(env.RNA_SOURCE_URL),
    downloadTimeoutMs: positive(
      env.ASSOCIATION_DOWNLOAD_TIMEOUT_MS,
      1_800_000,
      "ASSOCIATION_DOWNLOAD_TIMEOUT_MS",
    ),
    geocodingTimeoutMs: positive(
      env.ASSOCIATION_GEOCODING_TIMEOUT_MS,
      5_000,
      "ASSOCIATION_GEOCODING_TIMEOUT_MS",
    ),
  };
}
