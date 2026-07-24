/** Contrats HTTP partagés par le gateway et weather-service. */
export const WEATHER_NATURES = ["station_observation", "station_adjusted_by_model", "model_at_point", "calculated_estimate", "fallback", "unavailable"] as const;
export type WeatherNature = typeof WEATHER_NATURES[number];

export interface WeatherCoordinatesQuery { lat: string; lon: string; horizontalAccuracyMeters?: string }
export interface WeatherTemperatureResponse {
  location: { latitude: number; longitude: number; horizontalAccuracyMeters?: number; altitudeMeters: number | null };
  temperature: { valueCelsius: number; nature: "station_observation" | "station_adjusted_by_model" | "model_at_point"; referenceTime: string; retrievedAt: string; ageMinutes: number | null; stale: boolean; quality: "good" | "stale"; adjustment: { modelAtPointCelsius: number; modelAtStationCelsius: number; deltaCelsius: number; modelReferenceTime: string } | null };
  method: { id: "meteo-v2-temperature"; version: "2"; stationSelectionPolicyVersion: "1" };
  stationSelection: Record<string, unknown>;
  provenance: { source: Record<string, string> };
  degraded: boolean;
  unavailableSources: string[];
  requestId: string;
}
