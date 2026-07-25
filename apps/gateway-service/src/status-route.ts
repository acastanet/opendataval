import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";
import { SERVICES } from "./services-catalog.js";

/**
 * `GET /api/v2/status` — sonde d'état léger dédié aux pages du gateway (landing
 * et démos). Interroge en parallèle la santé de chaque microservice et renvoie
 * un état agrégé simple.
 *
 * Volontairement distinct de `/ready` : il ne relaie aucun corps amont ni
 * secret (seulement up/down + latence), ne renvoie jamais de 5xx (la landing
 * doit toujours se charger) et n'est pas une sonde d'orchestration.
 */

const STATUS_PROBE_TIMEOUT_MS = 1_500;

type ServiceStatus = "ok" | "unavailable";

interface ServiceStatusEntry {
  id: string;
  name: string;
  status: ServiceStatus;
  latencyMs: number;
}

const statusResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["generatedAt", "version", "services"],
  properties: {
    generatedAt: { type: "string" },
    version: { type: "string" },
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "status", "latencyMs"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["ok", "unavailable"] },
          latencyMs: { type: "integer" },
        },
      },
    },
  },
} as const;

async function probe(
  healthUrl: string,
  fetchImpl: FetchLike,
  requestId: string,
): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now();
  try {
    const response = await fetchImpl(healthUrl, {
      headers: { accept: "application/json", "x-request-id": requestId },
      signal: AbortSignal.timeout(STATUS_PROBE_TIMEOUT_MS),
    });
    return {
      status: response.ok ? "ok" : "unavailable",
      latencyMs: Date.now() - start,
    };
  } catch {
    return { status: "unavailable", latencyMs: Date.now() - start };
  }
}

export function registerStatusRoute(
  app: FastifyInstance,
  config: GatewayConfig,
  fetchImpl: FetchLike,
): void {
  app.get(
    "/api/v2/status",
    { schema: { response: { 200: statusResponseSchema } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const services = await Promise.all(
        SERVICES.map<Promise<ServiceStatusEntry>>(async (service) => {
          const healthUrl = service.healthUrl(config);
          if (healthUrl === null) {
            // Le gateway répond : il est vivant par construction.
            return { id: service.id, name: service.name, status: "ok", latencyMs: 0 };
          }
          const result = await probe(healthUrl, fetchImpl, request.id);
          return { id: service.id, name: service.name, ...result };
        }),
      );

      reply.header("x-request-id", request.id);
      return {
        generatedAt: new Date().toISOString(),
        version: config.version,
        services,
      };
    },
  );
}
