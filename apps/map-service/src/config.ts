import { ALTIMETRIE_IGN, REGIONS_RELIEF, type RegionRelief } from "@opendata-vda/shared/carto";
import type { CheminsRegionRelief } from "./services/relief-pmtiles.js";

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
  /** Une entrée par région de `REGIONS_RELIEF`, chemins d'archives PMTiles résolus. */
  reliefRegions: CheminsRegionRelief[];
  assetsRoot: string;
}

function entierPositif(value: string | undefined, fallback: number, nom: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${nom} doit être un entier strictement positif.`);
  return parsed;
}

/**
 * Résout les chemins d'archives d'une région depuis l'environnement : `MAP_RELIEF_<ID>_*_PATH`
 * en priorité, avec un repli sur `MAP_RELIEF_GLOBAL_PATH`/`MAP_RELIEF_HD_PATH` pour `aigoual`
 * seule — ce sont les variables historiques, déjà déployées, qui doivent continuer à
 * fonctionner sans changement de configuration.
 */
function cheminsRegion(env: NodeJS.ProcessEnv, region: RegionRelief): CheminsRegionRelief {
  const prefixe = `MAP_RELIEF_${region.id.toUpperCase().replace(/-/g, "_")}`;
  const legacyGlobal = region.id === "aigoual" ? env.MAP_RELIEF_GLOBAL_PATH : undefined;
  const legacyHd = region.id === "aigoual" ? env.MAP_RELIEF_HD_PATH : undefined;
  return {
    id: region.id,
    bounds: region.bounds,
    globalPath: env[`${prefixe}_GLOBAL_PATH`] ?? legacyGlobal ?? `/srv/relief/${region.id}.pmtiles`,
    hdPath: env[`${prefixe}_HD_PATH`] ?? legacyHd ?? `/srv/relief/${region.id}-hd.pmtiles`,
  };
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
    reliefRegions: REGIONS_RELIEF.map((region) => cheminsRegion(env, region)),
    assetsRoot: env.MAP_ASSETS_ROOT ?? new URL("../assets", import.meta.url).pathname,
  };
}
