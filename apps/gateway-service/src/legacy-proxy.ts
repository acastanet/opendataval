import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
} from "fastify";
import type { GatewayConfig } from "./config.js";

export type FetchLike = typeof fetch;

const LEGACY_PREFIX = "/api/v2/legacy";
const PROXY_METHODS: HTTPMethods[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

const EXCLUDED_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const EXCLUDED_RESPONSE_HEADERS = new Set([
  ...EXCLUDED_REQUEST_HEADERS,
  "content-encoding",
]);

function targetUrl(request: FastifyRequest, legacyApiUrl: string): string {
  const rawUrl = request.raw.url ?? LEGACY_PREFIX;
  const suffix = rawUrl.startsWith(LEGACY_PREFIX)
    ? rawUrl.slice(LEGACY_PREFIX.length)
    : "";
  const legacyPath = suffix === "" ? "/api" : `/api${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
  return new URL(legacyPath, `${legacyApiUrl}/`).toString();
}

function serializeBody(request: FastifyRequest): BodyInit | undefined {
  if (request.method === "GET" || request.method === "HEAD" || request.body === undefined) {
    return undefined;
  }
  if (typeof request.body === "string") return request.body;
  if (Buffer.isBuffer(request.body)) return new Uint8Array(request.body);
  return JSON.stringify(request.body);
}

function upstreamHeaders(request: FastifyRequest, body: BodyInit | undefined): Headers {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(request.headers)) {
    if (EXCLUDED_REQUEST_HEADERS.has(name.toLowerCase()) || rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) headers.append(name, value);
    } else {
      headers.set(name, String(rawValue));
    }
  }
  headers.set("x-request-id", request.id);
  if (body !== undefined && request.body !== undefined && typeof request.body === "object") {
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return headers;
}

function copyResponseHeaders(response: Response, reply: FastifyReply): void {
  response.headers.forEach((value, name) => {
    if (!EXCLUDED_RESPONSE_HEADERS.has(name.toLowerCase())) reply.header(name, value);
  });
}

function upstreamFailure(error: unknown): { statusCode: 502 | 504; code: string; message: string } {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return {
      statusCode: 504,
      code: "UPSTREAM_TIMEOUT",
      message: "Le service demandé n'a pas répondu dans le délai imparti.",
    };
  }
  return {
    statusCode: 502,
    code: "UPSTREAM_UNAVAILABLE",
    message: "Le service demandé est temporairement indisponible.",
  };
}

export function registerLegacyProxy(
  app: FastifyInstance,
  config: GatewayConfig,
  fetchImpl: FetchLike,
): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const url = targetUrl(request, config.legacyApiUrl);
    const body = serializeBody(request);

    try {
      const response = await fetchImpl(url, {
        method: request.method,
        headers: upstreamHeaders(request, body),
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(config.upstreamTimeoutMs),
      });
      const responseBody = Buffer.from(await response.arrayBuffer());
      copyResponseHeaders(response, reply);
      reply.header("x-request-id", request.id);
      return reply.code(response.status).send(responseBody);
    } catch (error) {
      const failure = upstreamFailure(error);
      request.log.error({ err: error, upstream: "legacy-api", url }, failure.code);
      return reply.code(failure.statusCode).send({
        error: {
          code: failure.code,
          message: failure.message,
          retryable: true,
        },
        requestId: request.id,
      });
    }
  };

  app.route({ method: PROXY_METHODS, url: LEGACY_PREFIX, handler });
  app.route({ method: PROXY_METHODS, url: `${LEGACY_PREFIX}/*`, handler });
}
