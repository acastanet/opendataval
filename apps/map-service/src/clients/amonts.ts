import { FONDS_CARTOGRAPHIQUES, GEOLOGIE, cheminFrameValide, urlTuileRadarAmont, type FondCartographique } from "@opendata-vda/shared/carto";
import { bboxWebMercator, type CoordonneesTuile } from "../domain/tuiles.js";

export interface ReponseBinaire { data: Buffer; contentType: string }
export type FetchLike = typeof fetch;

export class ErreurHttpAmont extends Error {
  constructor(readonly status: number) {
    super(`Amont cartographique HTTP ${status}`);
    this.name = "ErreurHttpAmont";
  }
}

export async function chargerBinaire(url: string, timeoutMs: number, fetchImpl: FetchLike): Promise<ReponseBinaire> {
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
    TRANSPARENT: "true",
  });
  return `${baseUrl}?${query}`;
}

export function urlRadar(path: string, tuile: CoordonneesTuile): string {
  if (!cheminFrameValide(path)) throw new Error("Chemin de frame radar invalide.");
  return urlTuileRadarAmont(path, tuile.z, tuile.x, tuile.y);
}
