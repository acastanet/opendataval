import { ALTIMETRIE_IGN, FONDS_CARTOGRAPHIQUES, GEOLOGIE, cheminFrameValide, urlTuileRadarAmont, type FondCartographique } from "@opendata-vda/shared/carto";
import { type EmpriseLambert } from "../domain/lambert93.js";
import { bboxWebMercator, type CoordonneesTuile } from "../domain/tuiles.js";

export interface ReponseBinaire { data: Buffer; contentType: string }
export type FetchLike = typeof fetch;

export class ErreurHttpAmont extends Error {
  constructor(readonly status: number) {
    super(`Amont cartographique HTTP ${status}`);
    this.name = "ErreurHttpAmont";
  }
}

/** Un dépassement de délai, quelle que soit la façon dont l'environnement le signale. */
export function estDelaiDepasse(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function requeteBinaire(url: string, timeoutMs: number, fetchImpl: FetchLike): Promise<ReponseBinaire> {
  const response = await fetchImpl(url, {
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg,*/*", "user-agent": "OpenDataVal map-service/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new ErreurHttpAmont(response.status);
  const longueur = Number(response.headers.get("content-length") ?? 0);
  if (longueur > 5_000_000) throw new Error("Réponse cartographique trop volumineuse.");
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > 5_000_000) throw new Error("Réponse cartographique trop volumineuse.");
  return { data, contentType: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" };
}

/**
 * Charge une ressource amont, avec une seconde chance pour les coupures immédiates.
 *
 * Le réessai est délibérément refusé aux dépassements de délai : sur une liaison lente,
 * l'amont finit par répondre, et relancer ne ferait que doubler l'attente d'une tuile que
 * le client a déjà cessé d'attendre. Un statut HTTP explicite n'est pas davantage
 * réessayé — l'amont a répondu, sa réponse fait foi.
 */
export async function chargerBinaire(url: string, timeoutMs: number, fetchImpl: FetchLike, tentatives = 2): Promise<ReponseBinaire> {
  for (let essai = 1; ; essai++) {
    try {
      return await requeteBinaire(url, timeoutMs, fetchImpl);
    } catch (error) {
      const definitive = error instanceof ErreurHttpAmont || estDelaiDepasse(error) || essai >= tentatives;
      if (definitive) throw error;
    }
  }
}

export function urlIgn(baseUrl: string, fond: FondCartographique, tuile: CoordonneesTuile): { url: string; contentType: string } {
  const descripteur = FONDS_CARTOGRAPHIQUES.find((item) => item.id === fond);
  if (!descripteur) throw new Error("Fond IGN inconnu.");
  const query = new URLSearchParams({
    SERVICE: "WMTS",
    VERSION: "1.0.0",
    REQUEST: "GetTile",
    LAYER: descripteur.coucheIgn,
    STYLE: "normal",
    TILEMATRIXSET: "PM",
    TILEMATRIX: String(tuile.z),
    TILEROW: String(tuile.y),
    TILECOL: String(tuile.x),
    FORMAT: descripteur.format,
  });
  return { url: `${baseUrl}?${query}`, contentType: descripteur.format };
}

export function urlBrgm(baseUrl: string, tuile: CoordonneesTuile): string {
  const bbox = bboxWebMercator(tuile).join(",");
  const query = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: GEOLOGIE.couche,
    STYLES: "",
    SRS: "EPSG:3857",
    BBOX: bbox,
    WIDTH: "256",
    HEIGHT: "256",
    FORMAT: "image/png",
    // Opaque, comme les autres fonds : en transparent, le BRGM renvoie de l'alpha=0 hors
    // recouvrement, et `raster-opacity` ne change rien à des pixels déjà transparents.
    TRANSPARENT: "false",
  });
  return `${baseUrl}?${query}`;
}

/**
 * Requête altimétrique RGE ALTI de la Géoplateforme, en BIL 32 bits sur une emprise
 * Lambert-93 — le système dans lequel la couche est réellement servie à son pas natif.
 *
 * En WMS 1.3.0, l'ordre des axes suit la définition du système : `X,Y` pour EPSG:2154 comme
 * pour EPSG:3857, à l'inverse d'EPSG:4326. Inversé, le service répond 200 avec un raster
 * entièrement à `nodata`, donc silencieusement faux.
 */
export function urlAltimetrieIgn(baseUrl: string, couche: string, emprise: EmpriseLambert): string {
  const query = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: couche,
    STYLES: "",
    CRS: ALTIMETRIE_IGN.crs,
    BBOX: `${emprise.minX},${emprise.minY},${emprise.maxX},${emprise.maxY}`,
    WIDTH: String(emprise.largeur),
    HEIGHT: String(emprise.hauteur),
    FORMAT: ALTIMETRIE_IGN.format,
  });
  return `${baseUrl}?${query}`;
}

export function urlRadar(path: string, tuile: CoordonneesTuile): string {
  if (!cheminFrameValide(path)) throw new Error("Chemin de frame radar invalide.");
  return urlTuileRadarAmont(path, tuile.z, tuile.x, tuile.y);
}
