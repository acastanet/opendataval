import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

function invalidSyntax(query: Record<string, unknown>): boolean {
  for (const name of ["lat", "lon", "horizontalAccuracyMeters"]) {
    const value = query[name];
    if (value !== undefined && (typeof value !== "string" || value.length > 32)) return true;
  }
  return query.positionSource !== undefined && !["browser-geolocation", "manual", "unknown"].includes(String(query.positionSource));
}

function failure(error: unknown): { status: 502 | 504; code: string; message: string } {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError"
    ? { status: 504, code: "GEOGRAPHY_SERVICE_TIMEOUT", message: "Le service géographique n'a pas répondu dans le délai imparti." }
    : { status: 502, code: "GEOGRAPHY_SERVICE_UNAVAILABLE", message: "Le service géographique est temporairement indisponible." };
}

export function registerGeographyProxy(app: FastifyInstance, config: GatewayConfig, fetchImpl: FetchLike): void {
  app.get<{ Querystring: Record<string, unknown> }>("/api/v2/geography/resolve", async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
    if (invalidSyntax(request.query)) return reply.code(400).send({ error: { code: "INVALID_COORDINATES", message: "Les paramètres géographiques sont invalides.", retryable: false }, requestId: request.id });
    const url = new URL(`${config.geographyServiceUrl}/internal/v1/geography/resolve`);
    for (const name of ["lat", "lon", "horizontalAccuracyMeters", "positionSource"]) {
      const value = request.query[name]; if (typeof value === "string") url.searchParams.set(name, value);
    }
    try {
      const response = await fetchImpl(url, { headers: { accept: "application/json", "x-request-id": request.id }, signal: AbortSignal.timeout(config.geographyServiceTimeoutMs) });
      reply.header("x-request-id", request.id); reply.header("content-type", response.headers.get("content-type") ?? "application/json");
      return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const normalized = failure(error);
      request.log.error({ err: error, upstream: "geography-service" }, normalized.code);
      return reply.code(normalized.status).send({ error: { code: normalized.code, message: normalized.message, retryable: true }, requestId: request.id });
    }
  });
}
