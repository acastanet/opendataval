import Fastify, { type FastifyInstance } from "fastify";
import type pg from "pg";
import { createInstance, getInstance, type CreationDalle } from "./instances.js";
import { lancerFabrication, type ClientsFabrication } from "./fabrication.js";
import { creerClientGeographie } from "./adapters/geography.js";
import type { SiteServiceConfig } from "./config.js";

export interface BuildAppOptions {
  config: SiteServiceConfig;
  pool: pg.Pool;
  clients?: ClientsFabrication;
  fetchImpl?: typeof fetch;
  logger?: boolean;
}

function erreur(code: string, message: string, requestId: string) {
  return { error: { code, message }, requestId };
}

function corpsCreation(body: unknown): CreationDalle | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const lat = Number(b.lat);
  const lon = Number(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (b.title !== undefined && typeof b.title !== "string") return null;
  return { lat, lon, title: (b.title as string | undefined) ?? null };
}

/**
 * Squelette du lot P3 (`agent/mvp/08-BACKLOG.md`) : création, lecture et déclenchement de
 * fabrication d'une instance. Routes en `/internal/v1/sites/*`, sur le modèle de
 * `geography-service` — seule la lecture sera un jour proxyée en `/api/v2/sites/*` par le
 * gateway (ADR-006, `agent/mvp/09-DECISIONS.md`) ; ce câblage gateway/Caddy reste hors
 * périmètre de ce lot. Revue et publication (P6) ne sont pas encore exposées ici.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true, requestIdHeader: "x-request-id", trustProxy: true });

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const clients: ClientsFabrication = options.clients ?? {
    geographie: creerClientGeographie({
      baseUrl: options.config.geographyServiceUrl,
      timeoutMs: options.config.geographyServiceTimeoutMs,
      fetchImpl,
    }),
  };

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.get("/health", async () => ({ status: "ok", service: "site-service", version: options.config.version }));
  app.get("/ready", async () => ({ status: "ready", service: "site-service", version: options.config.version }));

  app.post("/internal/v1/sites", async (request, reply) => {
    const entree = corpsCreation(request.body);
    if (!entree) {
      return reply
        .code(400)
        .send(erreur("INVALID_BODY", "lat et lon sont obligatoires et doivent être des nombres valides.", request.id));
    }

    try {
      const manifeste = await createInstance(options.pool, options.config.instancesDir, entree);
      return reply.code(201).send(manifeste);
    } catch (error) {
      if (error instanceof Error && /invalide/.test(error.message)) {
        return reply.code(400).send(erreur("INVALID_COORDINATES", error.message, request.id));
      }
      request.log.error({ err: error }, "échec de création d'instance");
      return reply.code(500).send(erreur("SITE_CREATION_FAILED", "La création de l'instance a échoué.", request.id));
    }
  });

  app.get<{ Params: { tileId: string } }>("/internal/v1/sites/:tileId", async (request, reply) => {
    const manifeste = await getInstance(options.config.instancesDir, request.params.tileId);
    if (!manifeste) {
      return reply.code(404).send(erreur("SITE_NOT_FOUND", "Aucune instance ne correspond à cet identifiant.", request.id));
    }
    return manifeste;
  });

  app.post<{ Params: { tileId: string } }>("/internal/v1/sites/:tileId/build", async (request, reply) => {
    try {
      return await lancerFabrication(options.pool, options.config.instancesDir, request.params.tileId, clients);
    } catch (error) {
      if (error instanceof Error && /introuvable/.test(error.message)) {
        return reply.code(404).send(erreur("SITE_NOT_FOUND", error.message, request.id));
      }
      if (error instanceof Error && /transition refusée/.test(error.message)) {
        return reply.code(409).send(erreur("SITE_INVALID_TRANSITION", error.message, request.id));
      }
      request.log.error({ err: error }, "échec de fabrication");
      return reply.code(500).send(erreur("SITE_BUILD_FAILED", "La fabrication de l'instance a échoué.", request.id));
    }
  });

  app.setErrorHandler((failure, request, reply) => {
    request.log.error({ err: failure }, "requête site-service en erreur");
    return reply.code(500).send(erreur("INTERNAL_ERROR", "Une erreur interne est survenue.", request.id));
  });

  return app;
}
