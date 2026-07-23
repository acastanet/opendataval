import { fetchJson, type FetchLike } from "./http.js";

function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }

export function createElevationClient(baseUrl: string, timeoutMs: number, fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)): { resolve(lat: number, lon: number): Promise<number | null> } {
  return { async resolve(lat, lon) {
    const url = new URL(baseUrl); url.searchParams.set("lat", String(lat)); url.searchParams.set("lon", String(lon)); url.searchParams.set("resource", "ign_rge_alti_wld"); url.searchParams.set("indent", "false"); url.searchParams.set("measures", "false");
    const root = object(await fetchJson(fetchImpl, url, timeoutMs)); const elevations = Array.isArray(root?.elevations) ? root.elevations : []; const first = elevations[0]; const value = typeof first === "number" ? first : object(first)?.z;
    return typeof value === "number" && Number.isFinite(value) && value !== -99_999 ? Math.round(value) : null;
  } };
}
