import { fetchJson, type FetchLike } from "./http.js";

export interface TerritoryClientResult { label: string; commune: { name: string; inseeCode: string }; department: { name: string; code: string }; epci: { name: string; code: string | null } | null }

function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

export function createTerritoryClient(baseUrl: string, timeoutMs: number, fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)): { resolve(lat: number, lon: number): Promise<TerritoryClientResult | null> } {
  return { async resolve(lat, lon) {
    const url = new URL(`${baseUrl}/communes`);
    url.searchParams.set("lat", String(lat)); url.searchParams.set("lon", String(lon));
    url.searchParams.set("fields", "nom,code,departement,epci"); url.searchParams.set("limit", "1");
    const data = await fetchJson(fetchImpl, url, timeoutMs);
    const first = Array.isArray(data) ? object(data[0]) : null;
    const name = text(first?.nom); const inseeCode = text(first?.code);
    const department = object(first?.departement); const departmentName = text(department?.nom); const departmentCode = text(department?.code);
    if (!name || !inseeCode || !departmentName || !departmentCode) return null;
    const epciValue = object(first?.epci); const epciName = text(epciValue?.nom); const epciCode = text(epciValue?.code);
    return { label: name, commune: { name, inseeCode }, department: { name: departmentName, code: departmentCode }, epci: epciName ? { name: epciName, code: epciCode } : null };
  } };
}
