import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

const PARAMETERS = ["lon_depart", "lat_depart", "lon_arrivee", "lat_arrivee", "hauteur_m", "largeur_m", "longueur_m", "poids_t", "charge_essieu_t", "nb_essieux", "matieres_dangereuses"] as const;

function valid(query: Record<string, unknown>): boolean {
  return PARAMETERS.every((name) => {
    const value = query[name];
    return value === undefined || (typeof value === "string" && value.length <= 40);
  });
}

function failure(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const timeout = name === "AbortError" || name === "TimeoutError";
  return { status: timeout ? 504 : 502, code: `ITINERAIRE_SERVICE_${timeout ? "TIMEOUT" : "UNAVAILABLE"}`, message: timeout ? "Le service d’itinéraire n’a pas répondu dans le délai imparti." : "Le service d’itinéraire est temporairement indisponible." } as const;
}

export function registerItineraireProxy(app: FastifyInstance, config: GatewayConfig, fetchImpl: FetchLike): void {
  app.get<{ Querystring: Record<string, unknown> }>("/api/v2/itineraire/poids-lourd", async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
    if (!valid(request.query)) return reply.code(400).send({ error: { code: "INVALID_QUERY", message: "Les paramètres du calcul d’itinéraire sont invalides.", retryable: false }, requestId: request.id });
    const upstream = new URL(`${config.itineraireServiceUrl ?? "http://itineraire-service:3000"}/internal/v1/itineraire/poids-lourd`);
    for (const name of PARAMETERS) { const value = request.query[name]; if (typeof value === "string") upstream.searchParams.set(name, value); }
    try {
      const response = await fetchImpl(upstream, { headers: { accept: "application/json", "x-request-id": request.id }, signal: AbortSignal.timeout(config.itineraireServiceTimeoutMs ?? 30_000) });
      reply.header("content-type", response.headers.get("content-type") ?? "application/json");
      return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const normalized = failure(error); request.log.error({ err: error, upstream: "itineraire-service" }, normalized.code);
      return reply.code(normalized.status).send({ error: { code: normalized.code, message: normalized.message, retryable: true }, requestId: request.id });
    }
  });
}
