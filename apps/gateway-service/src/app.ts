import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { loadConfig, type GatewayConfig } from "./config.js";
import { registerLegacyProxy, type FetchLike } from "./legacy-proxy.js";
import { registerGeographyProxy } from "./geography-proxy.js";
import { registerWeatherProxy } from "./weather-proxy.js";
import { registerVigilanceProxy } from "./vigilance-proxy.js";
import { registerFireDetectionProxy } from "./fire-detection-proxy.js";
import { registerAssociationProxy } from "./association-proxy.js";
import { registerOldProxy } from "./old-proxy.js";
import { registerItineraireProxy } from "./itineraire-proxy.js";
import { registerGeologieProxy, registerGeologieSyntheseProxy } from "./geologie-proxy.js";
import { registerStatusRoute } from "./status-route.js";
import { findService } from "./services-catalog.js";
import { renderLanding } from "./pages/landing.js";
import { renderDemo } from "./pages/demo.js";
import {
  APP_ICONE_SVG,
  APP_MANIFEST,
  renderAppTerrain,
} from "./pages/app-terrain.js";
import {
  renderApercuIndex,
  renderSiteInstance,
  renderSiteInstanceIndisponible,
  renderSiteInstanceIntrouvable,
  type ManifesteDalleVue,
} from "./pages/site-instance.js";
import { CAS_APERCU } from "./pages/dalle/fixtures.js";
import { registerSiteWriteProxy } from "./site-proxy.js";

export interface BuildAppOptions {
  config?: GatewayConfig;
  fetchImpl?: FetchLike;
  logger?: boolean;
}

const statusSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "version"],
  properties: {
    status: { type: "string" },
    service: { type: "string" },
    version: { type: "string" },
  },
} as const;

const readinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "version", "dependencies"],
  properties: {
    status: { type: "string", enum: ["ready", "not_ready"] },
    service: { type: "string" },
    version: { type: "string" },
    dependencies: {
      type: "object",
      additionalProperties: false,
      required: ["legacyApi"],
      properties: {
        legacyApi: { type: "string", enum: ["ok", "unavailable"] },
      },
    },
  },
} as const;

function normalizeError(error: unknown): { error: Error; statusCode: number } {
  const normalized = error instanceof Error
    ? error
    : new Error("Erreur inconnue");
  const statusCode = typeof error === "object"
    && error !== null
    && "statusCode" in error
    && typeof error.statusCode === "number"
    && error.statusCode >= 400
      ? error.statusCode
      : 500;
  return { error: normalized, statusCode };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: "x-request-id",
    trustProxy: true,
  });

  app.register(fastifyStatic, {
    root: fileURLToPath(new URL("../public/dalle/", import.meta.url)),
    prefix: "/api/v2/sites/viewer/",
    index: false,
    dotfiles: "deny",
    cacheControl: true,
    maxAge: "1h",
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.get(
    "/health",
    {
      schema: {
        response: { 200: statusSchema },
      },
    },
    async () => ({
      status: "ok",
      service: "gateway-service",
      version: config.version,
    }),
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: readinessSchema,
          503: readinessSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const response = await fetchImpl(`${config.legacyApiUrl}/api/health`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(config.upstreamTimeoutMs),
        });
        if (!response.ok) throw new Error(`API historique HTTP ${response.status}`);
        return {
          status: "ready",
          service: "gateway-service",
          version: config.version,
          dependencies: { legacyApi: "ok" },
        };
      } catch (error) {
        app.log.warn({ err: error, dependency: "legacy-api" }, "gateway non prêt");
        return reply.code(503).send({
          status: "not_ready",
          service: "gateway-service",
          version: config.version,
          dependencies: { legacyApi: "unavailable" },
        });
      }
    },
  );

  app.get(
    "/api/v2/gateway",
    {
      schema: {
        response: { 200: statusSchema },
      },
    },
    async () => ({
      status: "ok",
      service: "gateway-service",
      version: config.version,
    }),
  );

  // Pages HTML de la façade : accueil listant les microservices et démos
  // interactives. Servies par le gateway et atteintes via Caddy (/api/v2*).
  const sendHtml = (reply: FastifyReply, html: string): FastifyReply => {
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(html);
  };

  const landingHandler = async (_request: FastifyRequest, reply: FastifyReply) =>
    sendHtml(reply, renderLanding(config));

  app.get("/api/v2", landingHandler);
  app.get("/api/v2/", landingHandler);

  const terrainHandler = async (_request: FastifyRequest, reply: FastifyReply) =>
    sendHtml(reply, renderAppTerrain(config));

  app.get("/valfeu", terrainHandler);
  app.get("/valfeu/", terrainHandler);
  app.get("/valfeu/manifest.webmanifest", async (_request, reply) => {
    reply.header("content-type", "application/manifest+json; charset=utf-8");
    return reply.send(APP_MANIFEST);
  });
  app.get("/valfeu/icone.svg", async (_request, reply) => {
    reply.header("content-type", "image/svg+xml; charset=utf-8");
    return reply.send(APP_ICONE_SVG);
  });
  app.get("/api/v2/app", async (_request, reply) => reply.redirect("/valfeu", 308));
  app.get("/api/v2/app/", async (_request, reply) => reply.redirect("/valfeu/", 308));
  app.get("/api/v2/app/manifest.webmanifest", async (_request, reply) => reply.redirect("/valfeu/manifest.webmanifest", 308));
  app.get("/api/v2/app/icone.svg", async (_request, reply) => reply.redirect("/valfeu/icone.svg", 308));

  app.get<{ Params: { service: string } }>(
    "/api/v2/demo/:service",
    async (request: FastifyRequest<{ Params: { service: string } }>, reply: FastifyReply) => {
      const service = findService(request.params.service);
      if (!service) {
        return reply.code(404).send({
          error: {
            code: "UNKNOWN_SERVICE",
            message: "Ce microservice n'existe pas.",
            retryable: false,
          },
          requestId: request.id,
        });
      }
      return sendHtml(reply, renderDemo(config, service));
    },
  );

  const apercuHandler = async (_request: FastifyRequest, reply: FastifyReply) =>
    sendHtml(reply, renderApercuIndex(config, CAS_APERCU));

  app.get("/api/v2/sites/apercu", apercuHandler);
  app.get("/api/v2/sites/apercu/", apercuHandler);
  app.get<{ Params: { cas: string } }>(
    "/api/v2/sites/apercu/:cas",
    async (request: FastifyRequest<{ Params: { cas: string } }>, reply: FastifyReply) => {
      const cas = CAS_APERCU.find((candidat) => candidat.id === request.params.cas);
      if (!cas) {
        return reply.code(404).send({
          error: {
            code: "UNKNOWN_PREVIEW",
            message: "Ce cas d'aperçu n'existe pas.",
            retryable: false,
          },
          requestId: request.id,
        });
      }
      return sendHtml(reply, renderSiteInstance(config, cas.manifeste, { apercu: true }));
    },
  );

  // Consultation d'une dalle OpenDataVdA : le gateway récupère le manifeste côté serveur
  // depuis la route interne de site-service (jamais exposée directement, ADR-006) et rend
  // une page HTML complète — pas de route JSON publique pour cette lecture (ADR-008).
  app.get<{ Params: { tileId: string } }>(
    "/api/v2/sites/:tileId",
    async (request: FastifyRequest<{ Params: { tileId: string } }>, reply: FastifyReply) => {
      const baseUrl = config.siteServiceUrl ?? "http://site-service:3000";
      const upstream = new URL(
        `${baseUrl}/internal/v1/sites/${encodeURIComponent(request.params.tileId)}`,
      );
      try {
        const response = await fetchImpl(upstream, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(config.siteServiceTimeoutMs ?? 5_000),
        });
        if (response.status === 404) {
          return sendHtml(reply.code(404), renderSiteInstanceIntrouvable(config, request.params.tileId));
        }
        if (!response.ok) throw new Error(`site-service a répondu HTTP ${response.status}`);
        const manifeste = (await response.json()) as ManifesteDalleVue;
        return sendHtml(reply, renderSiteInstance(config, manifeste));
      } catch (error) {
        request.log.error({ err: error, upstream: "site-service" }, "échec de récupération de l'instance");
        return sendHtml(reply.code(502), renderSiteInstanceIndisponible(config));
      }
    },
  );

  registerSiteWriteProxy(app, config, fetchImpl);
  registerStatusRoute(app, config, fetchImpl);
  registerLegacyProxy(app, config, fetchImpl);
  registerGeographyProxy(app, config, fetchImpl);
  registerWeatherProxy(app, config, fetchImpl);
  registerVigilanceProxy(app, config, fetchImpl);
  registerFireDetectionProxy(app, config, fetchImpl);
  registerAssociationProxy(app, config, fetchImpl);
  registerOldProxy(app, config, fetchImpl);
  registerItineraireProxy(app, config, fetchImpl);
  registerGeologieProxy(app, config, fetchImpl);
  registerGeologieSyntheseProxy(app, config, fetchImpl);

  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error);
    request.log.error({ err: normalized.error }, "requête gateway en erreur");
    return reply.code(normalized.statusCode).send({
      error: {
        code: normalized.statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR",
        message: normalized.statusCode < 500
          ? normalized.error.message
          : "Une erreur interne est survenue.",
        retryable: normalized.statusCode >= 500,
      },
      requestId: request.id,
    });
  });

  return app;
}
