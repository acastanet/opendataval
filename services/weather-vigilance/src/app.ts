import Fastify, { type FastifyInstance } from "fastify";
import type { VigilanceConfig } from "./config.js";
import type { Metrics } from "./metrics.js";
import type { VigilanceStore } from "./store.js";

export interface BuildAppOptions { config: VigilanceConfig; store: VigilanceStore; metrics: Metrics; logger?: boolean }
const DEPARTMENT_PATTERN = /^(?:0[1-9]|1\d|2A|2B|2[1-9]|[3-8]\d|9[0-5])$/i;
function parseBoolean(value: unknown): boolean | null {
  if (value === undefined) return false;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}
function error(code: string, message: string, retryable: boolean, requestId: string) { return { error: { code, message, retryable }, requestId }; }

export function buildApp({ config, store, metrics, logger = true }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger, requestIdHeader: "x-request-id", trustProxy: true });
  app.addHook("onSend", async (request, reply, payload) => { reply.header("x-request-id", request.id); return payload; });

  app.get("/healthz", async () => ({ status: "ok", service: "weather-vigilance" }));
  app.get("/readyz", async (_request, reply) => {
    const status = store.getStatus();
    const body = { status: store.canServe() ? "ready" : "not_ready", data_status: store.canServe() ? "available" : "unavailable", freshness_status: status.freshness, last_successful_retrieval: status.lastSuccess };
    return store.canServe() ? body : reply.code(503).send(body);
  });
  app.get("/version", async () => ({ service: "weather-vigilance", version: config.version, commit: config.commit, built_at: config.builtAt }));
  app.get("/metrics", async (_request, reply) => reply.type("text/plain; version=0.0.4").send(metrics.render()));

  app.get<{ Params: { department_code: string }; Querystring: { include_bulletins?: unknown } }>("/v1/vigilance/departments/:department_code", async (request, reply) => {
    metrics.inc("vigilance_api_requests_total");
    const started = Date.now();
    const departmentCode = request.params.department_code.toUpperCase();
    const includeBulletins = parseBoolean(request.query.include_bulletins);
    if (!DEPARTMENT_PATTERN.test(departmentCode)) return reply.code(400).send(error("INVALID_DEPARTMENT_CODE", "Le code département est mal formé.", false, request.id));
    if (includeBulletins === null) return reply.code(400).send(error("INVALID_INCLUDE_BULLETINS", "include_bulletins doit être un booléen.", false, request.id));
    const status = store.getStatus();
    if (!store.canServe()) { metrics.inc("vigilance_cache_misses_total"); return reply.code(503).send({ service: "weather-vigilance", data_status: "unavailable", freshness_status: status.freshness, error: { code: "UPSTREAM_UNAVAILABLE", message: "La Vigilance officielle n'a pas pu être actualisée." }, source: { name: "Météo-France", last_successful_retrieval: status.lastSuccess }, requestId: request.id }); }
    const department = store.getDepartment(departmentCode);
    if (!department) { metrics.inc("vigilance_cache_misses_total"); return reply.code(404).send(error("DEPARTMENT_NOT_COVERED", "Le département est absent de la source officielle.", false, request.id)); }
    const snapshot = store.getSnapshot();
    if (!snapshot) return reply.code(503).send(error("NO_VALID_SNAPSHOT", "Aucune donnée officielle valide n'est disponible.", true, request.id));
    metrics.inc("vigilance_cache_hits_total");
    metrics.set("vigilance_api_duration_seconds", (Date.now() - started) / 1000);
    return {
      service: "weather-vigilance",
      version: config.version,
      data_status: "available",
      freshness_status: status.freshness,
      geographic_scope: "department",
      location: { department_code: department.department_code, department_name: department.department_name },
      periods: department.periods,
      bulletins: includeBulletins ? department.bulletins : [],
      source: { name: "Météo-France", product: "Vigilance météorologique", issued_at: snapshot.issued_at, retrieved_at: snapshot.retrieved_at, publication_id: snapshot.publication_id },
      cache: { status: status.restored ? "restored" : "hit", age_seconds: store.cacheAgeSeconds() },
      warnings: [...snapshot.warnings, ...department.warnings],
      requestId: request.id,
    };
  });

  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err, operation: "request", error_code: "INTERNAL_ERROR" }, "weather-vigilance request failed");
    return reply.code(500).send(error("INTERNAL_ERROR", "Une erreur interne est survenue.", true, request.id));
  });
  return app;
}
