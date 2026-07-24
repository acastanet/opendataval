import type { components } from "./schema";

export type LocationSummary = components["schemas"]["LocationSummary"];
export type LocationsResponse = components["schemas"]["LocationsResponse"];
export type ResolvedLocation = components["schemas"]["ResolvedLocation"];
export type AlertLevel = components["schemas"]["AlertLevel"];
export type NextChange = components["schemas"]["NextChange"];

/**
 * openapi-typescript expose actuellement le bloc `$defs` du JSON Schema externe
 * comme une propriété technique. Cette propriété n'appartient pas à la réponse
 * HTTP : l'adaptateur public la retire tout en conservant les types générés.
 */
type GeneratedWeatherProvenance = components["schemas"]["provenance.schema"];
export type WeatherProvenance = Omit<GeneratedWeatherProvenance, "$defs">;
export type ProvenanceValue = components["schemas"]["valueProvenance"];

type GeneratedEssentialWeather = components["schemas"]["EssentialWeather"];
export type EssentialWeather = Omit<GeneratedEssentialWeather, "provenance"> & {
  provenance: WeatherProvenance;
};

export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
  accuracyM?: number;
}

export interface GeographyResolution {
  query: WeatherCoordinates & { positionSource: "browser-geolocation" | "manual" | "unknown" };
  territory: {
    status: "available" | "not_found" | "unavailable" | "timeout";
    data: { label: string; commune: { name: string; inseeCode: string }; department: { name: string; code: string } } | null;
  };
  address: {
    status: "available" | "not_found" | "unavailable" | "timeout";
    data: { formatted: string; precision: "house" | "street" | "locality" | "unknown"; distanceMeters: number | null } | null;
  };
  elevation: {
    status: "available" | "not_found" | "unavailable" | "timeout";
    data: { meters: number } | null;
  };
  requestId: string;
}

export interface TemperatureResolution {
  location: WeatherCoordinates & { altitudeMeters: number | null };
  temperature: {
    valueCelsius: number;
    nature: "station_observation" | "station_adjusted_by_model" | "model_at_point";
    referenceTime: string;
    ageMinutes: number | null;
    stale: boolean;
    quality: "good" | "stale";
    retrievedAt?: string;
    adjustment?: { modelAtPointCelsius: number; modelAtStationCelsius: number; deltaCelsius: number; modelReferenceTime: string } | null;
  };
  method?: { id: string; version: string; stationSelectionPolicyVersion: string };
  stationSelection: {
    status: string;
    selectedStation: {
      name: string;
      network: string;
      distanceKilometers: number;
      altitudeDifferenceMeters: number | null;
    } | null;
  };
  provenance: { source: { provider: string; product: string } };
  degraded: boolean;
  unavailableSources: string[];
  requestId: string;
}

export interface VigilanceResolution {
  service: "weather-vigilance";
  version: string;
  data_status: "available";
  freshness_status: "fresh" | "stale";
  geographic_scope: "department";
  location: {
    department_code: string;
    department_name: string | null;
    resolved_by?: "geography-service" | "request";
  };
  periods: Array<{
    day: "today" | "tomorrow";
    overall_level: { code: "green" | "yellow" | "orange" | "red"; label: string };
    phenomena: Array<{ label: string; level: { code: "green" | "yellow" | "orange" | "red"; label: string } }>;
  }>;
  bulletins: Array<{ title: string; text: string }>;
  source: { name: string; product: string; issued_at: string | null; retrieved_at: string };
  cache: { status: "hit" | "restored"; age_seconds: number | null };
  warnings: Array<{ code: string; message: string }>;
  requestId: string;
}

export interface LiveWeatherData {
  geography: GeographyResolution | null;
  temperature: TemperatureResolution;
  /** L'absence de vigilance est une indisponibilité technique, jamais du vert. */
  vigilance: VigilanceResolution | null;
}
