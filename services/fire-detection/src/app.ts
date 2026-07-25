import Fastify, { type FastifyInstance } from "fastify";
import type { FireDetectionConfig } from "./config.js";
import { FireDetectionService } from "./service.js";

interface Query {
  lat?: unknown;
  lon?: unknown;
  accuracy?: unknown;
  radius_km?: unknown;
  history_days?: unknown;
}

function finite(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "" || value.length > 40) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function error(code: string, message: string, retryable: boolean, requestId: string) {
  return { error: { code, message, retryable }, requestId };
}

export interface BuildAppOptions {
  config: FireDetectionConfig;
  service?: Pick<FireDetectionService, "nearby">;
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const service = options.service ?? new FireDetectionService(config);
  const app = Fastify({ logger: options.logger ?? true, requestIdHeader: "x-request-id", trustProxy: true });
  app.addHook("onSend", async (request, reply, payload) => { reply.header("x-request-id", request.id); return payload; });

  app.get("/healthz", async () => ({ status: "ok", service: "fire-detection", version: config.version }));
  app.get("/readyz", async (_request, reply) => {
    const configured = Boolean(config.firmsMapKey || (config.eumetsatConsumerKey && config.eumetsatConsumerSecret));
    return reply.code(configured ? 200 : 503).send({
      status: configured ? "ready" : "not_ready",
      service: "fire-detection",
      version: config.version,
      sources: { firms: Boolean(config.firmsMapKey), eumetsat: Boolean(config.eumetsatConsumerKey && config.eumetsatConsumerSecret) },
    });
  });
  app.get<{ Querystring: Query }>("/v1/fire/nearby", async (request, reply) => {
    const latitude = finite(request.query.lat); const longitude = finite(request.query.lon);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return reply.code(400).send(error("INVALID_COORDINATES", "Les coordonnées sont invalides.", false, request.id));
    }
    const accuracy = request.query.accuracy === undefined ? undefined : finite(request.query.accuracy);
    if (request.query.accuracy !== undefined && (accuracy === undefined || accuracy === null || accuracy < 0)) {
      return reply.code(400).send(error("INVALID_ACCURACY", "La précision GPS est invalide.", false, request.id));
    }
    const radius = request.query.radius_km === undefined ? config.defaultRadiusKm : finite(request.query.radius_km);
    if (radius === null || radius < 1 || radius > config.maxRadiusKm) {
      return reply.code(400).send(error("INVALID_RADIUS", `radius_km doit être compris entre 1 et ${config.maxRadiusKm}.`, false, request.id));
    }
    const history = request.query.history_days === undefined ? config.historyDays : finite(request.query.history_days);
    if (history === null || !Number.isInteger(history) || history < 1 || history > 7) {
      return reply.code(400).send(error("INVALID_HISTORY", "history_days doit être un entier compris entre 1 et 7.", false, request.id));
    }
    const response = await service.nearby({
      latitude,
      longitude,
      ...(accuracy === undefined || accuracy === null ? {} : { accuracyM: accuracy }),
      radiusKm: radius,
      historyDays: history,
    });
    return { ...response, requestId: request.id };
  });

  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err, operation: "request", error_code: "INTERNAL_ERROR" }, "fire-detection request failed");
    return reply.code(500).send(error("INTERNAL_ERROR", "Une erreur interne est survenue.", true, request.id));
  });
  return app;
}
