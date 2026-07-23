import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

interface Query {
  lat?: unknown;
  lon?: unknown;
  accuracy?: unknown;
  department_code?: unknown;
  include_bulletins?: unknown;
}

function finite(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 32 || value.trim() === "") return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
}
function validDepartment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^(?:0[1-9]|1\d|2A|2B|2[1-9]|[3-8]\d|9[0-5])$/.test(code) ? code : null;
}
function validBoolean(value: unknown): boolean | null {
  if (value === undefined || value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  return null;
}
function upstreamFailure(error: unknown, service: "geography" | "vigilance") {
  const name = error instanceof Error ? error.name : "";
  const timeout = name === "AbortError" || name === "TimeoutError";
  return {
    status: timeout ? 504 : 502,
    code: `${service.toUpperCase()}_SERVICE_${timeout ? "TIMEOUT" : "UNAVAILABLE"}`,
    message: `Le service ${service === "geography" ? "géographique" : "de vigilance"} est temporairement indisponible.`,
  } as const;
}
async function jsonResponse(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error("Réponse amont non JSON");
  return response.json();
}
function extractDepartment(payload: unknown): { code: string; name: string | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const territory = (payload as { territory?: unknown }).territory;
  if (!territory || typeof territory !== "object") return null;
  const data = (territory as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const department = (data as { department?: unknown }).department;
  if (!department || typeof department !== "object") return null;
  const code = validDepartment(String((department as { code?: unknown }).code ?? ""));
  if (!code) return null;
  const name = typeof (department as { name?: unknown }).name === "string" ? (department as { name: string }).name : null;
  return { code, name };
}

export function registerVigilanceProxy(app: FastifyInstance, config: GatewayConfig, fetchImpl: FetchLike): void {
  app.get<{ Querystring: Query }>("/api/v2/vigilance", async (request: FastifyRequest<{ Querystring: Query }>, reply: FastifyReply) => {
    const query = request.query;
    const hasCoordinates = query.lat !== undefined || query.lon !== undefined;
    const requestedDepartment = query.department_code === undefined ? null : validDepartment(query.department_code);
    const includeBulletins = validBoolean(query.include_bulletins);
    if (query.department_code !== undefined && !requestedDepartment) return reply.code(400).send({ error: { code: "INVALID_DEPARTMENT_CODE", message: "Le code département est mal formé.", retryable: false }, requestId: request.id });
    if (includeBulletins === null) return reply.code(400).send({ error: { code: "INVALID_INCLUDE_BULLETINS", message: "include_bulletins doit être un booléen.", retryable: false }, requestId: request.id });
    if (!hasCoordinates && !requestedDepartment) return reply.code(400).send({ error: { code: "MISSING_LOCATION", message: "Fournissez des coordonnées ou un code département.", retryable: false }, requestId: request.id });

    let resolvedDepartment = requestedDepartment;
    let departmentName: string | null = null;
    let input: { latitude: number; longitude: number; accuracy_m?: number } | null = null;

    if (hasCoordinates) {
      const latitude = finite(query.lat); const longitude = finite(query.lon);
      const accuracy = query.accuracy === undefined ? undefined : finite(query.accuracy);
      const invalidAccuracy = query.accuracy !== undefined && (accuracy === null || (accuracy !== undefined && accuracy < 0));
      if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || invalidAccuracy) {
        return reply.code(400).send({ error: { code: "INVALID_COORDINATES", message: "Les coordonnées ou la précision GPS sont invalides.", retryable: false }, requestId: request.id });
      }
      const geographyUrl = new URL(`${config.geographyServiceUrl}/internal/v1/geography/resolve`);
      geographyUrl.searchParams.set("lat", String(latitude)); geographyUrl.searchParams.set("lon", String(longitude));
      if (accuracy !== undefined && accuracy !== null) geographyUrl.searchParams.set("horizontalAccuracyMeters", String(accuracy));
      geographyUrl.searchParams.set("positionSource", "unknown");
      try {
        const geographyResponse = await fetchImpl(geographyUrl, { headers: { accept: "application/json", "x-request-id": request.id }, signal: AbortSignal.timeout(config.geographyServiceTimeoutMs) });
        if (!geographyResponse.ok) return reply.code(geographyResponse.status === 404 ? 422 : geographyResponse.status).send(await jsonResponse(geographyResponse));
        const geography = extractDepartment(await jsonResponse(geographyResponse));
        if (!geography) return reply.code(422).send({ error: { code: "DEPARTMENT_NOT_RESOLVED", message: "Le département n'a pas pu être déterminé.", retryable: false }, requestId: request.id });
        if (requestedDepartment && requestedDepartment !== geography.code) return reply.code(422).send({ error: { code: "INCONSISTENT_DEPARTMENT", message: "Le code département ne correspond pas aux coordonnées.", retryable: false }, requestId: request.id });
        resolvedDepartment = geography.code; departmentName = geography.name;
        input = { latitude, longitude, ...(accuracy !== undefined && accuracy !== null ? { accuracy_m: accuracy } : {}) };
      } catch (error) {
        const failure = upstreamFailure(error, "geography");
        request.log.error({ err: error, upstream: "geography-service", error_code: failure.code }, "vigilance geography failed");
        return reply.code(failure.status).send({ error: { code: failure.code, message: failure.message, retryable: true }, requestId: request.id });
      }
    }

    if (!resolvedDepartment) return reply.code(422).send({ error: { code: "DEPARTMENT_NOT_RESOLVED", message: "Le département n'a pas pu être déterminé.", retryable: false }, requestId: request.id });
    const vigilanceBaseUrl = config.vigilanceServiceUrl ?? "http://weather-vigilance-service:3000";
    const vigilanceTimeoutMs = config.vigilanceServiceTimeoutMs ?? 3_000;
    const vigilanceUrl = new URL(`${vigilanceBaseUrl}/v1/vigilance/departments/${resolvedDepartment}`);
    vigilanceUrl.searchParams.set("include_bulletins", String(includeBulletins));
    try {
      const response = await fetchImpl(vigilanceUrl, { headers: { accept: "application/json", "x-request-id": request.id }, signal: AbortSignal.timeout(vigilanceTimeoutMs) });
      const payload = await jsonResponse(response);
      if (!response.ok || !payload || typeof payload !== "object") return reply.code(response.status).send(payload);
      const body = payload as Record<string, unknown>;
      body.location = {
        ...((body.location && typeof body.location === "object") ? body.location as Record<string, unknown> : {}),
        department_code: resolvedDepartment,
        ...(departmentName ? { department_name: departmentName } : {}),
        resolved_by: hasCoordinates ? "geography-service" : "request",
        ...(input ? { input } : {}),
      };
      return reply.code(response.status).send(body);
    } catch (error) {
      const failure = upstreamFailure(error, "vigilance");
      request.log.error({ err: error, upstream: "weather-vigilance-service", error_code: failure.code }, "vigilance upstream failed");
      return reply.code(failure.status).send({ error: { code: failure.code, message: failure.message, retryable: true }, requestId: request.id });
    }
  });
}
