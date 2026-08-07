import { ALTIMETRIE_IGN } from "@opendata-vda/shared/carto";

export interface MapConfig {
  host: string;
  port: number;
  version: string;
  ignUpstreamUrl: string;
  /** WMS altimétrique de la Géoplateforme, source du relief haute définition. */
  ignAltimetrieUrl: string;
  /**
   * Couche altimétrique interrogée. Surchargeable parce que le défaut désigne une pyramide
   * interne de l'IGN — un renommage amont se répare alors sans reconstruire l'image, et une
   * régression de résolution peut se contourner le temps de trouver mieux.
   */
  ignAltimetrieLayer: string;
  brgmUpstreamUrl: string;
  upstreamTimeoutMs: number;
  tileCacheMaxBytes: number;
  reliefGlobalPath: string;
  reliefHdPath: string;
  assetsRoot: string;
}

function entierPositif(value: string | undefined, fallback: number, nom: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${nom} doit être un entier strictement positif.`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MapConfig {
  return {
    host: env.HOST ?? "0.0.0.0",
    port: entierPositif(env.PORT, 3003, "PORT"),
    version: env.APP_VERSION ?? env.GIT_SHA ?? "dev",
    ignUpstreamUrl: env.IGN_WMTS_URL ?? "https://data.geopf.fr/wmts",
    ignAltimetrieUrl: env.IGN_ALTIMETRIE_WMS_URL ?? "https://data.geopf.fr/wms-r/wms",
    ignAltimetrieLayer: env.IGN_ALTIMETRIE_LAYER || ALTIMETRIE_IGN.couche,
    brgmUpstreamUrl: env.BRGM_WMS_URL ?? "https://geoservices.brgm.fr/geologie",
    // Huit secondes suffisaient sur une liaison rapide, mais expiraient en série sur une
    // connexion lente : l'IGN répondait, trop tard, et la carte se couvrait de trous.
    upstreamTimeoutMs: entierPositif(env.MAP_UPSTREAM_TIMEOUT_MS, 20_000, "MAP_UPSTREAM_TIMEOUT_MS"),
    tileCacheMaxBytes: entierPositif(env.MAP_TILE_CACHE_MAX_BYTES, 256 * 1024 * 1024, "MAP_TILE_CACHE_MAX_BYTES"),
    reliefGlobalPath: env.MAP_RELIEF_GLOBAL_PATH ?? "/srv/relief/aigoual.pmtiles",
    reliefHdPath: env.MAP_RELIEF_HD_PATH ?? "/srv/relief/aigoual-hd.pmtiles",
    assetsRoot: env.MAP_ASSETS_ROOT ?? new URL("../assets", import.meta.url).pathname,
  };
}
