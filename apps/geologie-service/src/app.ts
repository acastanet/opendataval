import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { createBrgmClient, ErreurBrgm, type BrgmClient } from "./clients/brgm.js";
import type { GeologieConfig } from "./config.js";
import { createCacheMemoire, type CacheMemoire } from "./services/cache.js";
import { rechercherOuvragesProches } from "./services/recherche-bss.js";
import { createReranker, type Reranker } from "./services/reranker.js";
import type { OuvrageBss } from "./types.js";

export interface GeologieClients {
  brgm: BrgmClient;
  reranker: Reranker;
}

type CacheBrgm = CacheMemoire<{ ouvrages: OuvrageBss[]; tronque: boolean }>;

export interface BuildAppOptions {
  config: GeologieConfig;
  clients?: GeologieClients;
  cache?: CacheBrgm;
  fetchImpl?: typeof fetch;
  logger?: boolean;
}

function erreur(code: string, message: string, retryable: boolean, requestId: string) {
  return { error: { code, message, retryable }, requestId };
}

interface EntreeValidee {
  lat: number;
  lon: number;
  rayonM: number;
  debug: boolean;
}

function parseInput(query: Record<string, unknown>): EntreeValidee | null {
  const lat = typeof query.lat === "string" ? Number(query.lat) : Number.NaN;
  const lon = typeof query.lon === "string" ? Number(query.lon) : Number.NaN;
  const rayonBrut = query.rayon;
  const rayonM = rayonBrut === undefined ? 5000 : typeof rayonBrut === "string" ? Number(rayonBrut) : Number.NaN;
  const debug = query.debug === "true";

  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lon) || lon < -180 || lon > 180 ||
    !Number.isFinite(rayonM) || rayonM < 1 || rayonM > 5000
  ) {
    return null;
  }

  return { lat, lon, rayonM, debug };
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: "x-request-id",
    trustProxy: true,
  });

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const clients: GeologieClients = options.clients ?? {
    brgm: createBrgmClient(options.config, fetchImpl),
    reranker: createReranker(options.config, fetchImpl),
  };
  const cache: CacheBrgm = options.cache ?? createCacheMemoire(
    options.config.cacheTtlSeconds,
    options.config.cacheMaxEntries,
  );

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "geologie-service",
    version: options.config.version,
  }));
  app.get("/ready", async () => ({
    status: "ready",
    service: "geologie-service",
    version: options.config.version,
  }));

  const proches = async (
    request: { query: Record<string, unknown>; id: string; log: FastifyBaseLogger },
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    const entree = parseInput(request.query);
    if (!entree) {
      return reply.code(400).send(erreur(
        "INVALID_QUERY",
        "lat et lon sont obligatoires ; rayon doit être compris entre 1 et 5000 mètres.",
        false,
        request.id,
      ));
    }

    try {
      return await rechercherOuvragesProches(entree, {
        brgm: clients.brgm,
        reranker: clients.reranker,
        cache,
        config: options.config,
        log: request.log,
      });
    } catch (error) {
      if (error instanceof ErreurBrgm) {
        const status = error.genre === "timeout" ? 504 : 502;
        const code = error.genre === "timeout"
          ? "GEOLOGIE_BRGM_TIMEOUT"
          : error.genre === "reponse_invalide"
            ? "GEOLOGIE_BRGM_INVALID_RESPONSE"
            : "GEOLOGIE_BRGM_UNAVAILABLE";
        request.log.error({ err: error }, code);
        return reply.code(status).send(erreur(code, error.message, true, request.id));
      }
      throw error;
    }
  };

  app.get<{ Querystring: Record<string, unknown> }>(
    "/internal/v1/geologie/bss/proches",
    proches,
  );
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v2/geologie/bss/proches",
    proches,
  );

  app.setErrorHandler((failure, request, reply) => {
    request.log.error({ err: failure }, "recherche BSS BRGM en erreur");
    return reply.code(500).send(erreur(
      "GEOLOGIE_CALCULATION_FAILED",
      "La recherche d'ouvrages BSS n'a pas pu être calculée.",
      true,
      request.id,
    ));
  });

  return app;
}
