import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { loadConfig, type VigilanceConfig } from "./config.js";
import { MeteoFranceClient, type FetchLike } from "./client.js";
import { normalizeDepartmentCode } from "./domain.js";
import { Metrics } from "./metrics.js";
import { VigilanceManager } from "./manager.js";
import { SnapshotStore } from "./store.js";

export interface BuildAppOptions {
  config?: VigilanceConfig;
  fetchImpl?: FetchLike;
  manager?: VigilanceManager;
  metrics?: Metrics;
  logger?: boolean;
  now?: () => Date;
  startScheduler?: boolean;
}

function error(code: string, message: string, retryable: boolean, requestId: string) {
  return { service: "weather-vigilance", data_status: "unavailable", error: { code, message, retryable }, request_id: requestId };
}
function bool(value: unknown): boolean { return ["1", "true", "yes"].includes(String(value ?? "").toLowerCase()); }

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const metrics = options.metrics ?? new Metrics();
  const now = options.now ?? (() => new Date());
  const manager = options.manager ?? new VigilanceManager(config, new MeteoFranceClient(config, options.fetchImpl), new SnapshotStore(config.snapshotPath), metrics, now);
  await manager.initialize(options.startScheduler ?? true);
  const app = Fastify({ logger: options.logger ?? true, requestIdHeader: "x-request-id", trustProxy: true });
  app.addHook("onSend", async (request, reply, payload) => { reply.header("x-request-id", request.id); return payload; });
  app.addHook("onClose", async () => manager.stop());

  const liveness = async () => ({ status: "ok", service: "weather-vigilance" });
  app.get("/healthz", liveness);
  app.get("/health", liveness);

  const readiness = async (_request: FastifyRequest, reply: FastifyReply) => {
    const freshness = manager.freshness();
    const usable = Boolean(manager.state.snapshot) && (freshness === "fresh" || freshness === "stale");
    const body = { status: usable ? "ready" : "not_ready", data_status: freshness, last_successful_retrieval: manager.state.lastSuccessfulRetrieval };
    return usable ? body : reply.code(503).send(body);
  };
  app.get("/readyz", readiness);
  app.get("/ready", readiness);
  app.get("/version", async () => ({ service: "weather-vigilance", version: config.version, commit: config.commit, built_at: config.builtAt }));
  app.get("/metrics", async (_request, reply) => reply.type("text/plain; version=0.0.4").send(metrics.render()));

  app.get<{ Params: { departmentCode: string }; Querystring: Record<string, unknown> }>("/v1/vigilance/departments/:departmentCode", async (request, reply) => {
    metrics.increment("vigilance_api_requests_total");
    const started = Date.now();
    try {
      const departmentCode = normalizeDepartmentCode(request.params.departmentCode);
      if (!departmentCode) return reply.code(400).send(error("INVALID_DEPARTMENT_CODE", "Le code département est mal formé.", false, request.id));
      const freshness = manager.freshness();
      const snapshot = manager.state.snapshot;
      if (!snapshot || freshness === "expired" || freshness === "unknown") {
        metrics.increment("vigilance_cache_misses_total");
        return reply.code(503).send({
          ...error("UPSTREAM_UNAVAILABLE", "La Vigilance officielle n’a pas pu être actualisée.", true, request.id),
          freshness_status: freshness,
          source: { name: "Météo-France", last_successful_retrieval: manager.state.lastSuccessfulRetrieval },
        });
      }
      const department = snapshot.departments[departmentCode];
      if (!department) return reply.code(404).send(error("DEPARTMENT_NOT_COVERED", "Le département est absent de la source officielle.", false, request.id));
      const includeBulletins = bool(request.query.include_bulletins ?? request.query.includeBulletins);
      const age = manager.ageSeconds();
      metrics.increment("vigilance_cache_hits_total");
      return {
        service: "weather-vigilance",
        version: config.version,
        data_status: "available",
        freshness_status: freshness,
        geographic_scope: "department",
        location: { department_code: department.departmentCode, department_name: department.departmentName, resolved_by: "department-code" },
        periods: department.periods.map((period) => ({
          day: period.day,
          date: period.date,
          overall_level: { code: period.overallLevel.code, rank: period.overallLevel.rank, label: period.overallLevel.label, source_code: period.overallLevel.sourceCode },
          phenomena: period.phenomena.map((phenomenon) => ({
            code: phenomenon.code,
            source_code: phenomenon.sourceCode,
            label: phenomenon.label,
            level: { code: phenomenon.level.code, rank: phenomenon.level.rank, label: phenomenon.level.label, source_code: phenomenon.level.sourceCode },
            timeline: phenomenon.timeline.map((entry) => ({ valid_from: entry.validFrom, valid_until: entry.validUntil, level: entry.level, source_level_code: entry.sourceLevelCode })),
          })),
          valid_from: period.validFrom,
          valid_until: period.validUntil,
        })),
        bulletins: includeBulletins ? department.bulletins.map((bulletin) => ({ scope: bulletin.scope, scope_code: bulletin.scopeCode, title: bulletin.title, text: bulletin.text, issued_at: bulletin.issuedAt, valid_from: bulletin.validFrom, valid_until: bulletin.validUntil, source_id: bulletin.sourceId })) : [],
        source: { name: snapshot.source.name, product: snapshot.source.product, issued_at: snapshot.source.issuedAt, retrieved_at: snapshot.source.retrievedAt, publication_id: snapshot.source.publicationId },
        cache: { status: "hit", age_seconds: age },
        warnings: [...snapshot.globalWarnings, ...department.warnings],
        request_id: request.id,
      };
    } finally {
      metrics.gauge("vigilance_api_duration_seconds", (Date.now() - started) / 1_000);
    }
  });

  app.setErrorHandler((err, request, reply) => {
    if (typeof err === "object" && err !== null && "validation" in err) return reply.code(400).send(error("BAD_REQUEST", "Les paramètres sont invalides.", false, request.id));
    request.log.error({ err }, "erreur weather-vigilance-service");
    return reply.code(500).send(error("INTERNAL_ERROR", "Une erreur interne est survenue.", true, request.id));
  });
  return app;
}
