import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

interface Query { lat?: unknown; lon?: unknown; accuracy?: unknown; }

function finite(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "" || value.length > 40) return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
}
function upstreamFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const timeout = name === "AbortError" || name === "TimeoutError";
  return {
    status: timeout ? 504 : 502,
    code: `FIRE_DETECTION_SERVICE_${timeout ? "TIMEOUT" : "UNAVAILABLE"}`,
    message: "Le service de détection d’incendie est temporairement indisponible.",
  } as const;
}
async function jsonResponse(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error("Réponse amont non JSON");
  return response.json();
}

export function registerFireDetectionProxy(app: FastifyInstance, config: GatewayConfig, fetchImpl: FetchLike): void {
  app.get<{ Querystring: Query }>("/api/v2/fire/nearby", async (request: FastifyRequest<{ Querystring: Query }>, reply: FastifyReply) => {
    const latitude = finite(request.query.lat); const longitude = finite(request.query.lon);
    const accuracy = request.query.accuracy === undefined ? undefined : finite(request.query.accuracy);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return reply.code(400).send({ error: { code: "INVALID_COORDINATES", message: "Les coordonnées sont invalides.", retryable: false }, requestId: request.id });
    }
    if (request.query.accuracy !== undefined && (accuracy === null || accuracy < 0)) {
      return reply.code(400).send({ error: { code: "INVALID_ACCURACY", message: "La précision GPS est invalide.", retryable: false }, requestId: request.id });
    }
    const baseUrl = config.fireDetectionServiceUrl ?? "http://fire-detection-service:3000";
    const timeoutMs = config.fireDetectionServiceTimeoutMs ?? 20_000;
    const upstream = new URL(`${baseUrl}/v1/fire/nearby`);
    upstream.searchParams.set("lat", String(latitude)); upstream.searchParams.set("lon", String(longitude));
    if (accuracy !== undefined && accuracy !== null) upstream.searchParams.set("accuracy", String(accuracy));
    upstream.searchParams.set("radius_km", "50");
    upstream.searchParams.set("history_days", "7");
    try {
      const response = await fetchImpl(upstream, {
        headers: { accept: "application/json", "x-request-id": request.id },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await jsonResponse(response);
      if (!payload || typeof payload !== "object") throw new Error("Réponse amont invalide");
      return reply.code(response.status).send({ ...(payload as Record<string, unknown>), requestId: request.id });
    } catch (error) {
      const failure = upstreamFailure(error);
      request.log.error({ err: error, upstream: "fire-detection-service", error_code: failure.code }, "fire detection upstream failed");
      return reply.code(failure.status).send({ error: { code: failure.code, message: failure.message, retryable: true }, requestId: request.id });
    }
  });
}
