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
