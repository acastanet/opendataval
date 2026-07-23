import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { loadMeteoObservationHealth } from "../lib/meteo-observation-health.js";

export function registerMeteoHealthRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get("/api/v1/meteo/health", async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      return await loadMeteoObservationHealth(pool);
    } catch (error) {
      request.log.error({ err: error }, "Échec du diagnostic des observations météo");
      reply.code(503);
      return {
        schemaVersion: "1",
        status: "unavailable",
        reason: "database_unavailable",
        generatedAt: new Date().toISOString(),
      };
    }
  });
}
