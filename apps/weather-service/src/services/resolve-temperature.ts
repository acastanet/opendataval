import type pg from "pg";
import { getGeographyContext, type FetchLike, type GeographyContext } from "../clients/geography-client.js";
import { getModelTemperature, getModelTemperatureAt, type ModelTemperature } from "../clients/weather-model-client.js";
import { selectStationObservation, type StationMeasurement } from "../policies/station-selection-policy.js";
import { loadNearbyStationMeasurements } from "../repositories/station-observation-repository.js";
import type { WeatherConfig } from "../config.js";

const MAX_MODEL_TIME_OFFSET_MS = 45 * 60 * 1_000;
const round = (value: number) => Math.round(value * 10) / 10;

export interface TemperatureDependencies {
  geography?: (lat: number, lon: number, accuracy: number | undefined) => Promise<GeographyContext>;
  model?: (lat: number, lon: number, validAt?: string) => Promise<ModelTemperature>;
  observations?: (lat: number, lon: number) => Promise<StationMeasurement[]>;
  now?: () => Date;
}

function modelTimesAreCompatible(
  observationTime: string,
  pointModel: ModelTemperature,
  stationModel: ModelTemperature,
): boolean {
  const observationAt = Date.parse(observationTime);
  const pointAt = Date.parse(pointModel.referenceTime);
  const stationAt = Date.parse(stationModel.referenceTime);
  return Number.isFinite(observationAt)
    && Number.isFinite(pointAt)
    && Number.isFinite(stationAt)
    && Math.abs(pointAt - observationAt) <= MAX_MODEL_TIME_OFFSET_MS
    && Math.abs(stationAt - observationAt) <= MAX_MODEL_TIME_OFFSET_MS
    && Math.abs(pointAt - stationAt) <= 60_000;
}

export async function resolveTemperature(
  config: WeatherConfig,
  pool: pg.Pool | null,
  latitude: number,
  longitude: number,
  horizontalAccuracyMeters: number | undefined,
  fetchImpl: FetchLike,
  dependencies: TemperatureDependencies = {},
) {
  const now = dependencies.now?.() ?? new Date();
  const geography = dependencies.geography ?? ((lat, lon, accuracy) => getGeographyContext(config.geographyServiceUrl, lat, lon, accuracy, config.geographyTimeoutMs, fetchImpl));
  const model = dependencies.model ?? ((lat, lon, validAt) => validAt
    ? getModelTemperatureAt(config.weatherModelUrl, lat, lon, validAt, config.weatherModelTimeoutMs, fetchImpl)
    : getModelTemperature(config.weatherModelUrl, lat, lon, config.weatherModelTimeoutMs, fetchImpl));
  const observations = dependencies.observations ?? ((lat, lon) => pool
    ? loadNearbyStationMeasurements(pool, lat, lon)
    : Promise.reject(new Error("base non configurée")));

  const geographyResult = await geography(latitude, longitude, horizontalAccuracyMeters);
  const [measurementResult, currentModelResult] = await Promise.allSettled([
    observations(geographyResult.latitude, geographyResult.longitude),
    model(geographyResult.latitude, geographyResult.longitude),
  ]);
  const measurements = measurementResult.status === "fulfilled" ? measurementResult.value : [];
  const decision = selectStationObservation({
    latitude: geographyResult.latitude,
    longitude: geographyResult.longitude,
    altitudeM: geographyResult.altitudeMeters,
  }, measurements, now);
  const selected = decision.selected;
  const currentModel = currentModelResult.status === "fulfilled" ? currentModelResult.value : null;

  let adjustment: { modelAtPointCelsius: number; modelAtStationCelsius: number; deltaCelsius: number; modelReferenceTime: string } | null = null;
  let correctionUnavailable = false;
  if (selected) {
    const [pointModelResult, stationModelResult] = await Promise.allSettled([
      model(geographyResult.latitude, geographyResult.longitude, selected.observedAt),
      model(selected.station.lat, selected.station.lon, selected.observedAt),
    ]);
    if (pointModelResult.status === "fulfilled"
      && stationModelResult.status === "fulfilled"
      && modelTimesAreCompatible(selected.observedAt, pointModelResult.value, stationModelResult.value)) {
      adjustment = {
        modelAtPointCelsius: pointModelResult.value.valueCelsius,
        modelAtStationCelsius: stationModelResult.value.valueCelsius,
        deltaCelsius: round(pointModelResult.value.valueCelsius - stationModelResult.value.valueCelsius),
        modelReferenceTime: pointModelResult.value.referenceTime,
      };
    } else {
      correctionUnavailable = true;
    }
  }

  if (!selected && !currentModel) {
    const error = new Error("Aucune température exploitable");
    (error as Error & { code?: string }).code = "WEATHER_NOT_AVAILABLE";
    throw error;
  }

  const usesAdjustedStation = selected !== null && adjustment !== null;
  const usesStation = selected !== null && !usesAdjustedStation;
  const referenceTime = selected?.observedAt ?? currentModel!.referenceTime;
  const source = selected
    ? {
      id: usesAdjustedStation ? "station-adjusted-by-arome" : selected.station.reseau === "meteofrance" ? "meteofrance-dpobs" : "infoclimat-static",
      provider: usesAdjustedStation ? "Météo-France et station locale" : selected.station.reseau === "meteofrance" ? "Météo-France" : "Infoclimat",
      product: usesAdjustedStation ? "Observation station ajustée par AROME" : selected.station.reseau === "meteofrance" ? "DPObs" : "StatIC",
      license: selected.station.licence,
    }
    : { id: "meteofrance-arome", provider: "Météo-France", product: "AROME via Open-Meteo", license: "Licence fournisseur" };

  return {
    location: {
      latitude: geographyResult.latitude,
      longitude: geographyResult.longitude,
      ...(geographyResult.horizontalAccuracyMeters !== undefined ? { horizontalAccuracyMeters: geographyResult.horizontalAccuracyMeters } : {}),
      altitudeMeters: geographyResult.altitudeMeters,
    },
    temperature: {
      valueCelsius: usesAdjustedStation
        ? round(selected!.temperatureC + adjustment!.deltaCelsius)
        : usesStation ? round(selected!.temperatureC) : currentModel!.valueCelsius,
      nature: usesAdjustedStation ? "station_adjusted_by_model" as const : usesStation ? "station_observation" as const : "model_at_point" as const,
      referenceTime,
      retrievedAt: now.toISOString(),
      ageMinutes: selected?.ageMinutes ?? null,
      stale: selected?.stale ?? false,
      quality: selected?.stale ? "stale" as const : "good" as const,
      adjustment,
    },
    method: { id: "meteo-v2-temperature" as const, version: "2" as const, stationSelectionPolicyVersion: "1" as const },
    stationSelection: {
      status: decision.status,
      reasonCode: decision.reasonCode,
      evaluatedCandidates: decision.evaluatedCandidates,
      eligibleCandidates: decision.eligibleCandidates,
      selectedStation: selected ? {
        id: selected.station.id,
        name: selected.station.nom,
        network: selected.station.reseau,
        altitudeMeters: selected.station.altitudeM,
        distanceKilometers: selected.distanceKm,
        altitudeDifferenceMeters: selected.altitudeDifferenceM,
        ageMinutes: selected.ageMinutes,
        selectionScore: selected.selectionScore,
      } : null,
    },
    provenance: { source },
    degraded: !selected || measurementResult.status === "rejected" || correctionUnavailable,
    unavailableSources: [
      ...(measurementResult.status === "rejected" ? ["station_observations"] : []),
      ...(correctionUnavailable ? ["model_correction"] : []),
    ],
  };
}
