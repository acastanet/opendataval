import type { FastifyInstance } from "fastify";
import type pg from "pg";
import {
  loadLatestStationMeasurements,
  type StationMeasurement,
} from "../lib/station-observations.js";
import {
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
  const loadMeasurements = overrides.loadStationMeasurements ?? loadLatestStationMeasurements;

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
