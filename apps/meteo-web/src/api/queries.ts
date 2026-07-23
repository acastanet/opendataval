import { useQuery } from "@tanstack/react-query";
import type { WeatherCoordinates } from "./contracts";
import { fetchEssentialWeather, fetchLiveWeather, fetchLocations } from "./weather-client";

export function useLocations() {
  return useQuery({
    queryKey: ["weather", "locations"],
    queryFn: ({ signal }) => fetchLocations(signal),
    staleTime: 24 * 60 * 60 * 1_000,
  });
}

export function useLiveWeather(
  coordinates: WeatherCoordinates | null,
  positionSource: "browser-geolocation" | "manual" | "unknown",
) {
  return useQuery({
    queryKey: ["gateway", "weather", coordinates?.latitude, coordinates?.longitude, coordinates?.accuracyM, positionSource],
    queryFn: ({ signal }) => fetchLiveWeather(coordinates!, positionSource, signal),
    enabled: coordinates !== null,
    refetchInterval: 5 * 60 * 1_000,
    staleTime: 60 * 1_000,
  });
}

export function useEssentialWeather(coordinates: WeatherCoordinates | null) {
  return useQuery({
    queryKey: [
      "weather",
      "essential",
      coordinates?.latitude,
      coordinates?.longitude,
      coordinates?.accuracyM,
    ],
    queryFn: ({ signal }) => fetchEssentialWeather(coordinates!, signal),
    enabled: coordinates !== null,
    refetchInterval: 15 * 60 * 1_000,
    staleTime: 5 * 60 * 1_000,
  });
}
