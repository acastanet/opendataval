import type { FastifyInstance } from "fastify";
import type { ResolvedGeography } from "../lib/geography.js";
import { buildEssentialProvenance } from "../lib/meteo-provenance.js";
import {
  currentStationObservationContext,
  runWithStationObservationContext,
} from "../lib/station-observation-context.js";
import { evaluateStationObservations } from "../lib/station-observations.js";

interface EssentialWeatherPayload {
  location: {
    latitude: number;
    longitude: number;
    label: string;
    municipality: ResolvedGeography["municipality"];
    department: ResolvedGeography["department"];
    altitudeM: number | null;
  };
  current: {
    temperatureC: number;
    apparentTemperatureC: number;
    weatherLabel: string;
    observedAt: string;
    nature: "observation" | "model";
    station: { id: string } | null;
  };
  today: { minimumC: number; maximumC: number };
  nextChange: { startsAt: string | null };
  nextHours: { at: string }[];
  alert: {
    indisponible: boolean;
    departmentCode: string | null;
  };
  unavailableSources: string[];
  generatedAt: string;
  provenance?: unknown;
  [key: string]: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEssentialWeatherPayload(payload: unknown): payload is EssentialWeatherPayload {
  if (!isObject(payload)) return false;
  return isObject(payload.location)
    && isObject(payload.current)
    && isObject(payload.today)
    && isObject(payload.nextChange)
    && Array.isArray(payload.nextHours)
    && isObject(payload.alert)
    && Array.isArray(payload.unavailableSources)
    && typeof payload.generatedAt === "string";
}

function isEssentialRequest(rawUrl: string | undefined): boolean {
  return rawUrl?.split("?", 1)[0] === "/api/v1/meteo/essential";
}

function geographyFromPayload(payload: EssentialWeatherPayload): ResolvedGeography {
  const administrativeAvailable = payload.location.municipality !== null
    && payload.location.department !== null;
  return {
    coordinates: {
      latitude: payload.location.latitude,
      longitude: payload.location.longitude,
    },
    label: payload.location.label,
    municipality: payload.location.municipality,
    department: payload.location.department,
    altitudeM: payload.location.altitudeM,
    resolution: {
      administrative: administrativeAvailable ? "ign" : "unavailable",
      altitude: payload.location.altitudeM === null ? "unavailable" : "ign",
    },
    unavailableSources: payload.unavailableSources.filter((source) => source.includes("IGN")),
    generatedAt: payload.generatedAt,
  };
}

export function enrichEssentialWeatherWithProvenance(
  payload: EssentialWeatherPayload,
): EssentialWeatherPayload {
  if (payload.provenance !== undefined) return payload;

  const context = currentStationObservationContext();
  const observationProviderUnavailable = context?.providerUnavailable
    ?? payload.unavailableSources.includes("Observations locales");
  const stationDecision = observationProviderUnavailable
    ? null
    : evaluateStationObservations(
      {
        latitude: payload.location.latitude,
        longitude: payload.location.longitude,
        altitudeM: payload.location.altitudeM,
      },
      context?.measurements ?? [],
      new Date(payload.generatedAt),
    );

  const modelUnavailable = payload.unavailableSources.includes(
    "Modèles Météo-France (AROME/ARPEGE)",
  );
  const hasSelectedObservation = stationDecision?.selected !== null
    && stationDecision?.selected !== undefined;

  const provenance = buildEssentialProvenance({
    retrievedAt: payload.generatedAt,
    geography: geographyFromPayload(payload),
    observationProviderUnavailable,
    stationDecision,
    model: {
      currentTemperatureAvailable: payload.current.nature === "model" || !modelUnavailable,
      apparentTemperatureAvailable: !modelUnavailable,
      weatherConditionAvailable: !modelUnavailable
        && payload.current.weatherLabel !== "Données indisponibles",
      validAt: payload.current.nature === "model" ? payload.current.observedAt : null,
      point: { latitude: null, longitude: null, altitudeM: null },
      todayRangeMode: modelUnavailable
        ? "fallback"
        : hasSelectedObservation
          ? "derived"
          : "model",
      todayRangeValidAt: null,
      nextChangeMode: modelUnavailable ? "fallback" : "derived",
      nextChangeValidAt: payload.nextChange.startsAt,
      nextHoursMode: modelUnavailable ? "fallback" : "model",
      nextHoursValidAt: payload.nextHours[0]?.at ?? null,
    },
    alert: {
      available: !payload.alert.indisponible,
      generatedAt: null,
      validAt: null,
    },
  });

  return { ...payload, provenance };
}

export function registerMeteoProvenanceHooks(app: FastifyInstance): void {
  app.addHook("onRequest", (_request, _reply, done) => {
    runWithStationObservationContext(done);
  });

  app.addHook("preSerialization", async (request, reply, payload) => {
    if (
      reply.statusCode !== 200
      || !isEssentialRequest(request.raw.url)
      || !isEssentialWeatherPayload(payload)
    ) {
      return payload;
    }
    return enrichEssentialWeatherWithProvenance(payload);
  });
}
