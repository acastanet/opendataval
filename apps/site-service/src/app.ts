import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type pg from "pg";
import { createInstance, getInstance, type CreationDalle } from "./instances.js";
import { lancerFabrication, type ClientsFabrication } from "./fabrication.js";
import { creerClientGeographie } from "./adapters/geography.js";
import { creerClientSceneProvisoire } from "./adapters/scene.js";
import { traiterRevue, publierInstance, type ActionRevue, type DecisionRevue } from "./review.js";
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

/** Traduit les échecs de `transitionerInstance` en codes HTTP, pour build/review/publish. */
async function repondreTransition(
  request: FastifyRequest,
  reply: FastifyReply,
  action: () => Promise<unknown>,
  codeEchecGenerique: string,
  messageEchecGenerique: string,
): Promise<unknown> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error && /introuvable/.test(error.message)) {
      return reply.code(404).send(erreur("SITE_NOT_FOUND", error.message, request.id));
    }
    if (error instanceof Error && /transition refusée/.test(error.message)) {
      return reply.code(409).send(erreur("SITE_INVALID_TRANSITION", error.message, request.id));
    }
    request.log.error({ err: error }, messageEchecGenerique);
    return reply.code(500).send(erreur(codeEchecGenerique, `${messageEchecGenerique}.`, request.id));
  }
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

const ACTIONS_REVUE: readonly ActionRevue[] = ["submit", "approve", "request_changes"];

/** `submit` est déclenché par le système (fin de fabrication) ; `approve`/`request_changes` sont des décisions humaines et exigent `reviewedBy`. */
function corpsRevue(body: unknown): { action: ActionRevue; decision: DecisionRevue } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.action !== "string" || !ACTIONS_REVUE.includes(b.action as ActionRevue)) return null;
  const action = b.action as ActionRevue;
  if (b.notes !== undefined && typeof b.notes !== "string") return null;

  if (action === "submit") return { action, decision: { notes: (b.notes as string | undefined) ?? null } };

  if (typeof b.reviewedBy !== "string" || b.reviewedBy.trim() === "") return null;
  return { action, decision: { reviewedBy: b.reviewedBy, notes: (b.notes as string | undefined) ?? null } };
}

/**
 * Lots P3 à P6 (`agent/mvp/08-BACKLOG.md`) : création, lecture, fabrication, revue et
 * publication d'une instance. Routes en `/internal/v1/sites/*`, sur le modèle de
 * `geography-service` — création, fabrication, revue et publication sont proxyées sans
 * authentification par le gateway (`apps/gateway-service/src/site-proxy.ts`, ADR-009,
 * `agent/mvp/09-DECISIONS.md`) ; seule la lecture y devient une page HTML plutôt qu'un
 * relais JSON (ADR-008).
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
    scene: creerClientSceneProvisoire({ glbUrl: options.config.demoSceneGlbUrl }),
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

  app.post<{ Params: { tileId: string } }>("/internal/v1/sites/:tileId/build", async (request, reply) =>
    repondreTransition(
      request,
      reply,
      () => lancerFabrication(options.pool, options.config.instancesDir, request.params.tileId, clients),
      "SITE_BUILD_FAILED",
      "La fabrication de l'instance a échoué",
    ),
  );

  app.post<{ Params: { tileId: string } }>("/internal/v1/sites/:tileId/review", async (request, reply) => {
    const entree = corpsRevue(request.body);
    if (!entree) {
      return reply
        .code(400)
        .send(
          erreur(
            "INVALID_BODY",
            "action doit être submit, approve ou request_changes ; reviewedBy est obligatoire pour approve et request_changes.",
            request.id,
          ),
        );
    }
    return repondreTransition(
      request,
      reply,
      () => traiterRevue(options.pool, options.config.instancesDir, request.params.tileId, entree.action, entree.decision),
      "SITE_REVIEW_FAILED",
      "La revue de l'instance a échoué",
    );
  });

  app.post<{ Params: { tileId: string } }>("/internal/v1/sites/:tileId/publish", async (request, reply) =>
    repondreTransition(
      request,
      reply,
      () => publierInstance(options.pool, options.config.instancesDir, request.params.tileId),
      "SITE_PUBLISH_FAILED",
      "La publication de l'instance a échoué",
    ),
  );

  app.setErrorHandler((failure, request, reply) => {
    request.log.error({ err: failure }, "requête site-service en erreur");
    return reply.code(500).send(erreur("INTERNAL_ERROR", "Une erreur interne est survenue.", request.id));
  });

  return app;
}
