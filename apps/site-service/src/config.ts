export interface SiteServiceConfig {
  /** Racine du volume `instances/` (ADR-007, `agent/mvp/01-ARCHITECTURE.md`). */
  instancesDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SiteServiceConfig {
  return {
    instancesDir: env.SITE_SERVICE_INSTANCES_DIR?.trim() || "./instances",
  };
}
