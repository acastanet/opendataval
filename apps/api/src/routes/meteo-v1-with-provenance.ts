import type { FastifyInstance } from "fastify";
import type pg from "pg";
import {
  loadLatestStationMeasurements,
  loadNearbyStationMeasurements,
  type StationMeasurement,
} from "../lib/station-observations.js";
import {
  currentStationObservationContext,
  recordStationMeasurements,
  recordStationProviderUnavailable,
} from "../lib/station-observation-context.js";
import { registerMeteoProvenanceHooks } from "../plugins/meteo-provenance.js";
import {
  registerMeteoV1Routes,
  type MeteoV1Dependencies,
} from "./meteo-v1.js";

export function registerMeteoV1RoutesWithProvenance(
  app: FastifyInstance,
  pool: pg.Pool,
  overrides: MeteoV1Dependencies = {},
): void {
  registerMeteoProvenanceHooks(app);
  const loadMeasurements = overrides.loadStationMeasurements
    ?? (async (database: pg.Pool): Promise<StationMeasurement[]> => {
      const target = currentStationObservationContext()?.target ?? null;
      return target
        ? loadNearbyStationMeasurements(database, target)
        : loadLatestStationMeasurements(database);
    });

  registerMeteoV1Routes(app, pool, {
    ...overrides,
    loadStationMeasurements: async (database): Promise<StationMeasurement[]> => {
      try {
        const measurements = await loadMeasurements(database);
        recordStationMeasurements(measurements);
        return measurements;
      } catch (error) {
        recordStationProviderUnavailable();
        throw error;
      }
    },
  });
}
