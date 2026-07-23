import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";
import type { FetchLike } from "./legacy-proxy.js";

interface GeographyResponse {
  query?: { latitude?: number; longitude?: number; horizontalAccuracyMeters?: number };
  territory?: { status?: string; data?: { department?: { code?: string; name?: string } } | null };
}

function syntax(query: Record<string, unknown>): { lat?: string; lon?: string; accuracy?: string; department?: string; includeBulletins: boolean } | null {
  const lat = typeof query.lat === "string" ? query.lat : undefined;
  const lon = typeof query.lon === "string" ? query.lon : undefined;
  const accuracy = typeof query.accuracy === "string" ? query.accuracy : typeof query.horizontalAccuracyMeters === "string" ? query.horizontalAccuracyMeters : undefined;
  const department = typeof query.department_code === "string" ? query.department_code.toUpperCase() : undefined;
  if ((lat === undefined) !== (lon === undefined)) return null;
  if (!department && lat === undefined) return null;
  if (department && !/^(?:0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(department)) return null;
  if (lat !== undefined) {
    const latitude = Number(lat), longitude = Number(lon), accuracyNumber = accuracy === undefined ? undefined : Number(accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    if (accuracyNumber !== undefined && (!Number.isFinite(accuracyNumber) || accuracyNumber < 0)) return null;
  }
  return { lat, lon, accuracy, department, includeBulletins: ["1", "true", "yes"].includes(String(query.include_bulletins ?? "").toLowerCase()) };
}

function upstreamFailure(error: unknown, dependency: "geography" | "vigilance") {
  const timeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
  return {
    status: timeout ? 504 : 502,
    code: timeout ? `${dependency.toUpperCase()}_SERVICE_TIMEOUT` : `${dependency.toUpperCase()}_SERVICE_UNAVAILABLE`,
    message: timeout ? `Le service ${dependency} n'a pas répondu dans le délai imparti.` : `Le service ${dependency} est temporairement indisponible.`,
  };
}

async function jsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) throw new Error("réponse amont non JSON");
  return response.json();
}

export function registerVigilanceProxy(app: FastifyInstance, config: GatewayConfig, fetchImpl: FetchLike): void {
  app.get<{ Querystring: Record<string, unknown> }>("/api/v2/vigilance", async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
    const parsed = syntax(request.query);
    if (!parsed) return reply.code(400).send({ error: { code: "INVALID_VIGILANCE_QUERY", message: "Fournir un code département ou une paire lat/lon valide.", retryable: false }, requestId: request.id });

    let geography: GeographyResponse | null = null;
    let departmentCode = parsed.department;
    if (parsed.lat !== undefined && parsed.lon !== undefined) {
      const url = new URL(`${config.geographyServiceUrl}/internal/v1/geography/resolve`);
      url.searchParams.set("lat", parsed.lat); url.searchParams.set("lon", parsed.lon);
      if (parsed.accuracy !== undefined) url.searchParams.set("horizontalAccuracyMeters", parsed.accuracy);
      url.searchParams.set("positionSource", "manual");
      try {
        const response = await fetchImpl(url, { headers: { accept: "application/json", "x-request-id": request.id }, signal: AbortSignal.timeout(config.geographyServiceTimeoutMs) });
        if (!response.ok) return reply.code(response.status === 404 ? 422 : response.status).send(await jsonResponse(response));
        geography = await jsonResponse(response) as GeographyResponse;
      } catch (error) {
        const failure = upstreamFailure(error, "geography"); request.log.error({ err: error, upstream: "geography-service" }, failure.code);
        return reply.code(failure.status).send({ error: { code: failure.code, message: failure.message, retryable: true }, requestId: request.id });
      }
      const resolved = geography.territory?.status === "available" ? geography.territory.data?.department?.code?.toUpperCase() : undefined;
      if (!resolved) return reply.code(422).send({ error: { code: "DEPARTMENT_NOT_RESOLVED", message: "Le département n'a pas pu être déterminé à partir des coordonnées.", retryable: false }, requestId: request.id });
      if (departmentCode && departmentCode !== resolved) return reply.code(422).send({ error: { code: "DEPARTMENT_COORDINATES_MISMATCH", message: "Le code département ne correspond pas aux coordonnées fournies.", retryable: false }, requestId: request.id });
      departmentCode = resolved;
    }

    const vigilanceUrl = new URL(`${config.vigilanceServiceUrl ?? "http://weather-vigilance-service:3000"}/v1/vigilance/departments/${encodeURIComponent(departmentCode!)}`);
    if (parsed.includeBulletins) vigilanceUrl.searchParams.set("include_bulletins", "true");
    try {
      const response = await fetchImpl(vigilanceUrl, { headers: { accept: "application/json", "x-request-id": request.id }, signal: AbortSignal.timeout(config.vigilanceServiceTimeoutMs ?? 4_000) });
      const body = await jsonResponse(response);
      if (!response.ok) return reply.code(response.status).send(body);
      const result = body as Record<string, unknown>;
      const sourceLocation = typeof result.location === "object" && result.location !== null ? result.location as Record<string, unknown> : {};
      result.location = {
        ...sourceLocation,
        department_code: departmentCode,
        department_name: geography?.territory?.data?.department?.name ?? sourceLocation.department_name ?? null,
        resolved_by: geography ? "location-service" : "department-code",
        ...(geography ? { input: { latitude: geography.query?.latitude ?? Number(parsed.lat), longitude: geography.query?.longitude ?? Number(parsed.lon), accuracy_m: geography.query?.horizontalAccuracyMeters ?? (parsed.accuracy === undefined ? null : Number(parsed.accuracy)) } } : {}),
      };
      result.request_id = request.id;
      return reply.code(200).send(result);
    } catch (error) {
      const failure = upstreamFailure(error, "vigilance"); request.log.error({ err: error, upstream: "weather-vigilance-service" }, failure.code);
      return reply.code(failure.status).send({ error: { code: failure.code, message: failure.message, retryable: true }, requestId: request.id });
    }
  });
}
