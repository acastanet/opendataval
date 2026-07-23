import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type GatewayConfig } from "./config.js";
import { registerLegacyProxy, type FetchLike } from "./legacy-proxy.js";

export interface BuildAppOptions {
  config?: GatewayConfig;
  fetchImpl?: FetchLike;
  logger?: boolean;
}

const statusSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "version"],
  properties: {
    status: { type: "string" },
    service: { type: "string" },
    version: { type: "string" },
  },
} as const;

const readinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "version", "dependencies"],
  properties: {
    status: { type: "string", enum: ["ready", "not_ready"] },
    service: { type: "string" },
    version: { type: "string" },
    dependencies: {
      type: "object",
      additionalProperties: false,
      required: ["legacyApi"],
      properties: {
        legacyApi: { type: "string", enum: ["ok", "unavailable"] },
      },
    },
  },
} as const;

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: "x-request-id",
    trustProxy: true,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.get(
    "/health",
    {
      schema: {
        response: { 200: statusSchema },
      },
    },
    async () => ({
      status: "ok",
      service: "gateway-service",
      version: config.version,
    }),
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: readinessSchema,
          503: readinessSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const response = await fetchImpl(`${config.legacyApiUrl}/api/health`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(config.upstreamTimeoutMs),
        });
        if (!response.ok) throw new Error(`API historique HTTP ${response.status}`);
        return {
          status: "ready",
          service: "gateway-service",
          version: config.version,
          dependencies: { legacyApi: "ok" },
        };
      } catch (error) {
        app.log.warn({ err: error, dependency: "legacy-api" }, "gateway non prêt");
        return reply.code(503).send({
          status: "not_ready",
          service: "gateway-service",
          version: config.version,
          dependencies: { legacyApi: "unavailable" },
        });
      }
    },
  );

  app.get(
    "/api/v2/gateway",
    {
      schema: {
        response: { 200: statusSchema },
      },
    },
    async () => ({
      status: "ok",
      service: "gateway-service",
      version: config.version,
    }),
  );

  registerLegacyProxy(app, config, fetchImpl);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "requête gateway en erreur");
    const statusCode = error.statusCode && error.statusCode >= 400
      ? error.statusCode
      : 500;
    return reply.code(statusCode).send({
      error: {
        code: statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR",
        message: statusCode < 500
          ? error.message
          : "Une erreur interne est survenue.",
        retryable: statusCode >= 500,
      },
      requestId: request.id,
    });
  });

  return app;
}
