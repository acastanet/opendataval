import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

function valid(query: Record<string, unknown>): boolean {
  for (const name of ["lat", "lon", "rayon", "debug"]) {
    const value = query[name];
    if (value !== undefined && (typeof value !== "string" || value.length > 40)) return false;
  }
  return true;
}

function failure(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const timeout = name === "AbortError" || name === "TimeoutError";
  return {
    status: timeout ? 504 : 502,
    code: `GEOLOGIE_SERVICE_${timeout ? "TIMEOUT" : "UNAVAILABLE"}`,
    message: timeout
      ? "Le service Géologie n’a pas répondu dans le délai imparti."
      : "Le service Géologie est temporairement indisponible.",
  } as const;
}

export function registerGeologieProxy(
  app: FastifyInstance,
  config: GatewayConfig,
  fetchImpl: FetchLike,
): void {
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v2/geologie/bss/proches",
    async (
      request: FastifyRequest<{ Querystring: Record<string, unknown> }>,
      reply: FastifyReply,
    ) => {
      if (!valid(request.query)) {
        return reply.code(400).send({
          error: {
            code: "INVALID_QUERY",
            message: "Les paramètres de la recherche BSS sont invalides.",
            retryable: false,
          },
          requestId: request.id,
        });
      }
      const baseUrl = config.geologieServiceUrl ?? "http://geologie-service:3000";
      const upstream = new URL(`${baseUrl}/internal/v1/geologie/bss/proches`);
      for (const name of ["lat", "lon", "rayon", "debug"]) {
        const value = request.query[name];
        if (typeof value === "string") upstream.searchParams.set(name, value);
      }
      try {
        const response = await fetchImpl(upstream, {
          headers: { accept: "application/json", "x-request-id": request.id },
          signal: AbortSignal.timeout(config.geologieServiceTimeoutMs ?? 45_000),
        });
        reply.header("content-type", response.headers.get("content-type") ?? "application/json");
        return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        const normalized = failure(error);
        request.log.error({ err: error, upstream: "geologie-service" }, normalized.code);
        return reply.code(normalized.status).send({
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: true,
          },
          requestId: request.id,
        });
      }
    },
  );
}
