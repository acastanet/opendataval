import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

interface AssociationQuery {
  code_insee?: unknown;
  q?: unknown;
  status?: unknown;
  category?: unknown;
  category_primary?: unknown;
  category_secondary?: unknown;
  limit?: unknown;
  cursor?: unknown;
}

const ADMINISTRATIVE_STATUSES = new Set(["active", "dissolved", "unknown"]);

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined) return "";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
}

function errorBody(requestId: string, code: string, message: string) {
  return {
    error: { code, message, retryable: false },
    requestId,
  };
}

async function jsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) throw new Error("Réponse amont non JSON");
  return response.json();
}

export function registerAssociationProxy(
  app: FastifyInstance,
  config: GatewayConfig,
  fetchImpl: FetchLike,
): void {
  const baseUrl = () => (config.associationServiceUrl ?? "http://association-service:3000").replace(/\/$/, "");
  const relay = async (request: FastifyRequest, reply: FastifyReply, path: string, query?: URLSearchParams) => {
    const upstream = new URL(`${baseUrl()}${path}`);
    query?.forEach((value, key) => upstream.searchParams.set(key, value));
    try {
      const response = await fetchImpl(upstream, { headers: { accept: "application/json", "x-request-id": request.id }, signal: AbortSignal.timeout(config.associationServiceTimeoutMs ?? 5_000) });
      const payload = await jsonResponse(response);
      if (!payload || typeof payload !== "object") throw new Error("Réponse amont invalide");
      return reply.code(response.status).send({ ...(payload as Record<string, unknown>), requestId: request.id });
    } catch (error) {
      const name = error instanceof Error ? error.name : ""; const timeout = name === "AbortError" || name === "TimeoutError";
      const code = `ASSOCIATION_SERVICE_${timeout ? "TIMEOUT" : "UNAVAILABLE"}`;
      request.log.error({ err: error, upstream: "association-service", error_code: code }, "association upstream failed");
      return reply.code(timeout ? 504 : 502).send({ error: { code, message: "Le service des associations est temporairement indisponible.", retryable: true }, requestId: request.id });
    }
  };
  const communeRoute = (path: string) => app.get<{ Querystring: AssociationQuery }>(path, async (request, reply) => {
    const codeInsee = optionalText(request.query.code_insee, 5);
    if (codeInsee === null || !/^\d{5}$/.test(codeInsee)) return reply.code(400).send(errorBody(request.id, "INVALID_CODE_INSEE", "Le code INSEE doit contenir exactement 5 chiffres."));
    return relay(request, reply, path, new URLSearchParams({ code_insee: codeInsee }));
  });
  communeRoute("/api/v2/associations/stats");
  communeRoute("/api/v2/associations/map");
  app.get<{ Params: { id: string } }>("/api/v2/associations/:id", async (request, reply) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.params.id)) return reply.code(400).send(errorBody(request.id, "INVALID_ASSOCIATION_ID", "L’identifiant d’association est invalide."));
    return relay(request, reply, `/api/v2/associations/${encodeURIComponent(request.params.id)}`);
  });
  app.get<{ Querystring: AssociationQuery }>(
    "/api/v2/associations",
    async (
      request: FastifyRequest<{ Querystring: AssociationQuery }>,
      reply: FastifyReply,
    ) => {
      const codeInsee = optionalText(request.query.code_insee, 5);
      if (codeInsee === null || !/^\d{5}$/.test(codeInsee)) {
        return reply.code(400).send(
          errorBody(request.id, "INVALID_CODE_INSEE", "Le code INSEE doit contenir exactement 5 chiffres."),
        );
      }

      const search = optionalText(request.query.q, 200);
      const category = optionalText(request.query.category, 100);
      const categoryPrimary = optionalText(request.query.category_primary, 100);
      const categorySecondary = optionalText(request.query.category_secondary, 100);
      const cursor = optionalText(request.query.cursor, 2_048);
      if (search === null || category === null || categoryPrimary === null || categorySecondary === null || cursor === null) {
        return reply.code(400).send(
          errorBody(request.id, "INVALID_QUERY", "Un critère de recherche est trop long ou mal formé."),
        );
      }

      const status = optionalText(request.query.status, 16);
      if (status === null || (status !== "" && !ADMINISTRATIVE_STATUSES.has(status))) {
        return reply.code(400).send(
          errorBody(request.id, "INVALID_STATUS", "Le statut doit être active, dissolved ou unknown."),
        );
      }

      let limit: number | null = null;
      if (request.query.limit !== undefined) {
        const rawLimit = optionalText(request.query.limit, 3);
        limit = rawLimit === null || rawLimit === "" ? null : Number(rawLimit);
        if (limit === null || !Number.isInteger(limit) || limit < 1 || limit > 100) {
          return reply.code(400).send(
            errorBody(request.id, "INVALID_LIMIT", "La limite doit être un entier compris entre 1 et 100."),
          );
        }
      }

      const query = new URLSearchParams({ code_insee: codeInsee });
      if (search) query.set("q", search); if (status) query.set("status", status); if (category) query.set("category", category); if (categoryPrimary) query.set("category_primary", categoryPrimary); if (categorySecondary) query.set("category_secondary", categorySecondary); if (limit !== null) query.set("limit", String(limit)); if (cursor) query.set("cursor", cursor);
      return relay(request, reply, "/api/v2/associations", query);
    },
  );
}
