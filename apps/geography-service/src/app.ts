import Fastify, { type FastifyInstance } from "fastify";
import { createElevationClient } from "./clients/elevation-client.js";
import { createReverseGeocodingClient } from "./clients/reverse-geocoding-client.js";
import { createTerritoryClient } from "./clients/territory-client.js";
import { errorSchema, resolveQuerySchema, resolveResponseSchema } from "./contracts/geography.js";
import { loadConfig, type GeographyConfig } from "./config.js";
import { parseCoordinates } from "./domain/coordinates.js";
import { overallFailure, resolveLocation, type GeographyClients } from "./services/resolve-location.js";
import type { FetchLike } from "./clients/http.js";

export interface BuildAppOptions { config?: GeographyConfig; fetchImpl?: FetchLike; clients?: GeographyClients; logger?: boolean; now?: () => Date }
function error(code: string, message: string, retryable: boolean, requestId: string) { return { error: { code, message, retryable }, requestId }; }
function rounded(value: number) { return Math.round(value * 100) / 100; }
function accuracyBucket(value: number | undefined) { if (value === undefined) return "unknown"; if (value < 10) return "<10m"; if (value < 50) return "10-50m"; if (value < 200) return "50-200m"; if (value < 1_000) return "200m-1km"; return ">1km"; }

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig(); const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis); const now = options.now ?? (() => new Date());
  const clients = options.clients ?? { territory: createTerritoryClient(config.territoryUpstreamUrl, config.territoryTimeoutMs, fetchImpl), address: createReverseGeocodingClient(config.reverseGeocodingUpstreamUrl, config.reverseGeocodingTimeoutMs, fetchImpl), elevation: createElevationClient(config.elevationUpstreamUrl, config.elevationTimeoutMs, fetchImpl) };
  const app = Fastify({ logger: options.logger ?? true, requestIdHeader: "x-request-id", trustProxy: true });
  app.addHook("onSend", async (request, reply, payload) => { reply.header("x-request-id", request.id); return payload; });
  app.get("/health", { schema: { response: { 200: { type: "object", additionalProperties: false, required: ["status", "service", "version"], properties: { status: { type: "string" }, service: { type: "string" }, version: { type: "string" } } } } } }, async () => ({ status: "ok", service: "geography-service", version: config.version }));
  app.get("/ready", { schema: { response: { 200: { type: "object", additionalProperties: false, required: ["status", "service", "version"], properties: { status: { type: "string" }, service: { type: "string" }, version: { type: "string" } } } } } }, async () => ({ status: "ready", service: "geography-service", version: config.version }));
  app.get<{ Querystring: Record<string, unknown> }>("/internal/v1/geography/resolve", { schema: { querystring: resolveQuerySchema, response: { 200: resolveResponseSchema, 400: errorSchema, 404: errorSchema, 502: errorSchema, 504: errorSchema } } }, async (request, reply) => {
    const coordinates = parseCoordinates(request.query); if (!coordinates) return reply.code(400).send(error("INVALID_COORDINATES", "Les coordonnées ou la précision horizontale sont invalides.", false, request.id));
    const result = await resolveLocation(coordinates, clients, config, now()); const failure = overallFailure(result);
    request.log.info({ requestId: request.id, route: "resolve", latitudeRounded: rounded(coordinates.latitude), longitudeRounded: rounded(coordinates.longitude), horizontalAccuracyBucket: accuracyBucket(coordinates.horizontalAccuracyMeters), territoryUpstream: result.territory.status, addressUpstream: result.address.status, elevationUpstream: result.elevation.status, elevationAvailable: result.elevation.status === "available" }, "résolution géographique");
    if (failure === "not_found") return reply.code(404).send(error("LOCATION_NOT_RESOLVABLE", "Aucun enrichissement géographique exploitable.", false, request.id));
    if (failure === "timeout") return reply.code(504).send(error("GEOGRAPHY_SERVICE_TIMEOUT", "Les fournisseurs géographiques n'ont pas répondu dans le délai imparti.", true, request.id));
    if (failure === "unavailable") return reply.code(502).send(error("GEOGRAPHY_SERVICE_UNAVAILABLE", "Les fournisseurs géographiques sont indisponibles.", true, request.id));
    return { ...result, requestId: request.id };
  });
  app.setErrorHandler((err, request, reply) => {
    if (typeof err === "object" && err !== null && "validation" in err) return reply.code(400).send(error("INVALID_COORDINATES", "Les coordonnées ou les paramètres sont invalides.", false, request.id));
    request.log.error({ err }, "erreur interne geography-service");
    return reply.code(500).send(error("INTERNAL_ERROR", "Une erreur interne est survenue.", true, request.id));
  });
  return app;
}
