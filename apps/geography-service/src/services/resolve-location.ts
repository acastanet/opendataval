import type { GeographyConfig } from "../config.js";
import type { Coordinates } from "../domain/coordinates.js";
import type { AddressData, ElevationData, Enrichment, EnrichmentStatus, TerritoryData } from "../domain/results.js";
import { UpstreamError } from "../clients/http.js";

export interface GeographyClients { territory: { resolve(lat: number, lon: number): Promise<TerritoryData | null> }; address: { resolve(lat: number, lon: number): Promise<AddressData | null> }; elevation: { resolve(lat: number, lon: number): Promise<number | null> } }
export interface ResolvedLocation { query: Coordinates; territory: Enrichment<TerritoryData>; address: Enrichment<AddressData>; elevation: Enrichment<ElevationData> }

function status(error: unknown): EnrichmentStatus {
  if (error instanceof UpstreamError) return error.kind;
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError" ? "timeout" : "unavailable";
}
function settled<T>(result: PromiseSettledResult<T | null>, source: string, now: string): Enrichment<T> {
  if (result.status === "rejected") return { status: status(result.reason), data: null, provenance: { source, resolvedAt: now } };
  if (result.value === null) return { status: "not_found", data: null, provenance: { source, resolvedAt: now } };
  return { status: "available", data: result.value, provenance: { source, resolvedAt: now } };
}

function withinGlobalBudget<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new UpstreamError("timeout", "budget global dépassé")), timeoutMs);
    promise.then((value) => { clearTimeout(timeout); resolve(value); }, (error: unknown) => { clearTimeout(timeout); reject(error); });
  });
}

export async function resolveLocation(coordinates: Coordinates, clients: GeographyClients, config: GeographyConfig, now = new Date()): Promise<ResolvedLocation> {
  const [territoryResult, addressResult, elevationResult] = await Promise.allSettled([
    withinGlobalBudget(clients.territory.resolve(coordinates.latitude, coordinates.longitude), config.globalTimeoutMs),
    withinGlobalBudget(clients.address.resolve(coordinates.latitude, coordinates.longitude), config.globalTimeoutMs),
    withinGlobalBudget(clients.elevation.resolve(coordinates.latitude, coordinates.longitude), config.globalTimeoutMs),
  ]);
  const resolvedAt = now.toISOString();
  const elevation = settled(elevationResult, "IGN Géoplateforme — RGE ALTI", resolvedAt);
  const elevationData = elevation.data === null ? null : { meters: elevation.data as unknown as number, verticalDatum: "NGF-IGN69", horizontalResolutionMeters: 5, verticalAccuracyMeters: null, interpolation: null } satisfies ElevationData;
  return { query: coordinates, territory: settled(territoryResult, "API Découpage administratif", resolvedAt), address: settled(addressResult, "IGN Géoplateforme — Géocodage inverse", resolvedAt), elevation: { ...elevation, data: elevationData } };
}

export function overallFailure(result: ResolvedLocation): "not_found" | "unavailable" | "timeout" | null {
  const statuses = [result.territory.status, result.address.status, result.elevation.status];
  if (statuses.includes("available")) return null;
  if (statuses.every((value) => value === "not_found")) return "not_found";
  if (statuses.every((value) => value === "timeout")) return "timeout";
  return "unavailable";
}
