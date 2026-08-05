import Fastify, { type FastifyInstance } from "fastify";
import { analyzeOld } from "./analysis.js";
import type { OldConfig } from "./config.js";
import { createSourceClients } from "./sources.js";
import type { OldSourceClients } from "./types.js";

export interface BuildAppOptions {
  config: OldConfig;
  clients?: OldSourceClients;
  fetchImpl?: typeof fetch;
  logger?: boolean;
  now?: () => Date;
}

function error(code: string, message: string, retryable: boolean, requestId: string) {
  return { error: { code, message, retryable }, requestId };
}

function parseInput(query: Record<string, unknown>): {
  lon: number;
  lat: number;
  distanceMeters: number;
} | null {
  const lon = typeof query.lon === "string" ? Number(query.lon) : Number.NaN;
  const lat = typeof query.lat === "string" ? Number(query.lat) : Number.NaN;
  const distanceMeters = query.distance_m === undefined
    ? 50
    : typeof query.distance_m === "string"
      ? Number(query.distance_m)
      : Number.NaN;
  if (
    !Number.isFinite(lon) || lon < -180 || lon > 180 ||
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(distanceMeters) || distanceMeters < 1 || distanceMeters > 200
  ) return null;
  return { lon, lat, distanceMeters };
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: "x-request-id",
    trustProxy: true,
  });
  const clients = options.clients ?? createSourceClients(
    options.config,
    options.fetchImpl ?? globalThis.fetch.bind(globalThis),
  );

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "old-service",
    version: options.config.version,
  }));
  app.get("/ready", async () => ({
    status: "ready",
    service: "old-service",
    version: options.config.version,
  }));

  const perimeter = async (request: { query: Record<string, unknown>; id: string }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    const input = parseInput(request.query);
    if (!input) {
      return reply.code(400).send(error(
        "INVALID_QUERY",
        "lon et lat sont obligatoires ; distance_m doit être comprise entre 1 et 200 mètres.",
        false,
        request.id,
      ));
    }
    return analyzeOld({
      input,
      clients,
      config: options.config,
      now: options.now,
    });
  };

  app.get<{ Querystring: Record<string, unknown> }>(
    "/internal/v1/old/perimetre",
    perimeter,
  );
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v2/old/perimetre",
    perimeter,
  );

  app.setErrorHandler((failure, request, reply) => {
    request.log.error({ err: failure }, "calcul OLD en erreur");
    return reply.code(500).send(error(
      "OLD_CALCULATION_FAILED",
      "Le périmètre OLD n’a pas pu être calculé.",
      true,
      request.id,
    ));
  });
  return app;
}
