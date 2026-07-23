export type EnrichmentStatus = "available" | "not_found" | "unavailable" | "timeout";

export interface Provenance { source: string; resolvedAt: string }
export interface Enrichment<T> { status: EnrichmentStatus; data: T | null; provenance: Provenance }

export interface TerritoryData {
  label: string;
  commune: { name: string; inseeCode: string };
  department: { name: string; code: string };
  epci: { name: string; code: string | null } | null;
}
export interface AddressData {
  formatted: string;
  houseNumber: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  precision: "house" | "street" | "locality" | "unknown";
  distanceMeters: number | null;
}
export interface ElevationData {
  meters: number;
  verticalDatum: string | null;
  horizontalResolutionMeters: number | null;
  verticalAccuracyMeters: number | null;
  interpolation: string | null;
}
