import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

/**
 * Expose publiquement la création, la fabrication, la revue et la publication d'une dalle
 * (`POST /api/v2/sites`, `.../build`, `.../review`, `.../publish`), proxyées vers les routes
 * internes de `site-service`. Revient sur ADR-006 (`agent/mvp/09-DECISIONS.md`), qui
 * réservait ces écritures au réseau interne faute d'authentification décidée — décision
 * explicitement levée par l'utilisateur (ADR-009), qui couvre par avance `review`/`publish`.
 */

function failure(error: unknown): { status: 502 | 504; code: string; message: string } {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError"
    ? { status: 504, code: "SITE_SERVICE_TIMEOUT", message: "site-service n'a pas répondu dans le délai imparti." }
    : { status: 502, code: "SITE_SERVICE_UNAVAILABLE", message: "site-service est temporairement indisponible." };
}

async function relay(
  request: FastifyRequest,
  reply: FastifyReply,
  config: GatewayConfig,
  fetchImpl: FetchLike,
  upstreamPath: string,
  init: RequestInit,
): Promise<FastifyReply> {
  const baseUrl = config.siteServiceUrl ?? "http://site-service:3000";
  const timeoutMs = config.siteServiceTimeoutMs ?? 5_000;
  try {
    const response = await fetchImpl(`${baseUrl}${upstreamPath}`, {
      ...init,
      headers: { ...init.headers, "x-request-id": request.id },
      signal: AbortSignal.timeout(timeoutMs),
    });
    reply.header("x-request-id", request.id);
    reply.header("content-type", response.headers.get("content-type") ?? "application/json");
    return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const normalized = failure(error);
    request.log.error({ err: error, upstream: "site-service" }, normalized.code);
    return reply.code(normalized.status).send({
      error: { code: normalized.code, message: normalized.message, retryable: true },
      requestId: request.id,
    });
  }
}

function initPost(body?: unknown): RequestInit {
  return body === undefined
    ? { method: "POST", headers: { accept: "application/json" } }
    : { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) };
}

export function registerSiteWriteProxy(app: FastifyInstance, config: GatewayConfig, fetchImpl: FetchLike): void {
  app.post("/api/v2/sites", async (request: FastifyRequest, reply: FastifyReply) =>
    relay(request, reply, config, fetchImpl, "/internal/v1/sites", initPost(request.body ?? {})),
  );

  app.post<{ Params: { tileId: string } }>(
    "/api/v2/sites/:tileId/build",
    async (request: FastifyRequest<{ Params: { tileId: string } }>, reply: FastifyReply) =>
      relay(request, reply, config, fetchImpl, `/internal/v1/sites/${encodeURIComponent(request.params.tileId)}/build`, initPost()),
  );

  app.post<{ Params: { tileId: string } }>(
    "/api/v2/sites/:tileId/review",
    async (request: FastifyRequest<{ Params: { tileId: string } }>, reply: FastifyReply) =>
      relay(request, reply, config, fetchImpl, `/internal/v1/sites/${encodeURIComponent(request.params.tileId)}/review`, initPost(request.body ?? {})),
  );

  app.post<{ Params: { tileId: string } }>(
    "/api/v2/sites/:tileId/publish",
    async (request: FastifyRequest<{ Params: { tileId: string } }>, reply: FastifyReply) =>
      relay(request, reply, config, fetchImpl, `/internal/v1/sites/${encodeURIComponent(request.params.tileId)}/publish`, initPost()),
  );
}
