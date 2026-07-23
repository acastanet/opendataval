import { distanceMeters } from "../domain/coordinates.js";
import { fetchJson, type FetchLike } from "./http.js";

export interface ReverseAddress { formatted: string; houseNumber: string | null; street: string | null; postalCode: string | null; city: string | null; precision: "house" | "street" | "locality" | "unknown"; distanceMeters: number | null }
function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

export function createReverseGeocodingClient(baseUrl: string, timeoutMs: number, fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)): { resolve(lat: number, lon: number): Promise<ReverseAddress | null> } {
  return { async resolve(lat, lon) {
    const url = new URL(`${baseUrl}/reverse`); url.searchParams.set("lat", String(lat)); url.searchParams.set("lon", String(lon)); url.searchParams.set("index", "address"); url.searchParams.set("limit", "1");
    const root = object(await fetchJson(fetchImpl, url, timeoutMs)); const feature = Array.isArray(root?.features) ? object(root?.features[0]) : null; const properties = object(feature?.properties);
    const formatted = text(properties?.label); if (!formatted) return null;
    const type = text(properties?.type); const geometry = object(feature?.geometry); const coords = Array.isArray(geometry?.coordinates) ? geometry?.coordinates : [];
    const featureLon = typeof coords[0] === "number" ? coords[0] : null; const featureLat = typeof coords[1] === "number" ? coords[1] : null;
    const precision = type === "housenumber" ? "house" : type === "street" ? "street" : type === "locality" || type === "municipality" ? "locality" : "unknown";
    return { formatted, houseNumber: text(properties?.housenumber), street: text(properties?.name), postalCode: text(properties?.postcode), city: text(properties?.city), precision, distanceMeters: featureLat === null || featureLon === null ? null : distanceMeters({ latitude: lat, longitude: lon }, { latitude: featureLat, longitude: featureLon }) };
  } };
}
