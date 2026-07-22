import type { components } from "./schema";

export type LocationSummary = components["schemas"]["LocationSummary"];
export type LocationsResponse = components["schemas"]["LocationsResponse"];
export type ResolvedLocation = components["schemas"]["ResolvedLocation"];
export type EssentialWeather = components["schemas"]["EssentialWeather"];
export type AlertLevel = components["schemas"]["AlertLevel"];
export type NextChange = components["schemas"]["NextChange"];
export type WeatherProvenance = components["schemas"]["WeatherProvenance"];
export type ProvenanceValue = components["schemas"]["ProvenanceValue"];

export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
  accuracyM?: number;
}
