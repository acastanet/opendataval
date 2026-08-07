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

/**
 * Chemin relatif au domaine servi par Caddy (ex. `/valleraugue-3d/...`) ou URL HTTP(S)
 * complète. La scène de démonstration M1 est servie par Caddy depuis
 * `poc/valleraugue-mairie-3d/publication/`, hors du réseau interne des services — une URL
 * relative au domaine public, pas un chemin de système de fichiers, est donc le bon contrat.
 */
function cheminOuUrl(value: string | undefined, fallback: string, name: string): string {
  const trimmed = value?.trim() || fallback;
  if (trimmed.startsWith("/")) return trimmed;
  const parsed = new URL(trimmed);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${name} doit être un chemin relatif au domaine (commençant par /) ou une URL HTTP(S)`);
  }
  return parsed.toString();
}

export interface SiteServiceConfig {
  host: string;
  port: number;
  version: string;

  /** Racine du volume `instances/` (ADR-007, `agent/mvp/01-ARCHITECTURE.md`). */
  instancesDir: string;
  migrationsDir: string;

  /** Premier adaptateur du lot P3 (`agent/mvp/08-BACKLOG.md`) : géographie/adresse/altitude. */
  geographyServiceUrl: string;
  geographyServiceTimeoutMs: number;

  /**
   * Raccord de scène provisoire du lot P4 (`agent/mvp/08-BACKLOG.md`) :
   * URL de la scène déjà publiée par `poc/valleraugue-mairie-3d` (« maison-200m », même
   * emprise 200 m que la dalle MVP, ADR-004), attachée telle quelle en attendant le
   * déclenchement réel du pipeline (lot P8). Ne décrit pas géométriquement la dalle créée.
   */
  demoSceneGlbUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SiteServiceConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    version: env.APP_VERSION?.trim() || env.GIT_SHA?.trim() || "dev",

    instancesDir: env.SITE_SERVICE_INSTANCES_DIR?.trim() || "./instances",
    migrationsDir: env.MIGRATIONS_DIR?.trim() || "/app/db/migrations",

    geographyServiceUrl: httpUrl(
      env.GEOGRAPHY_SERVICE_URL,
      "http://geography-service:3000",
      "GEOGRAPHY_SERVICE_URL",
    ),
    geographyServiceTimeoutMs: positiveInteger(
      env.GEOGRAPHY_SERVICE_TIMEOUT_MS,
      5_000,
      "GEOGRAPHY_SERVICE_TIMEOUT_MS",
    ),

    demoSceneGlbUrl: cheminOuUrl(
      env.SITE_SERVICE_DEMO_SCENE_URL,
      "/valleraugue-3d/assets/scenes/maison-200m/scene.glb",
      "SITE_SERVICE_DEMO_SCENE_URL",
    ),
  };
}
