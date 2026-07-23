import assert from "node:assert/strict";
import test from "node:test";
import { MeteoFranceClient, UpstreamError } from "../src/client.js";
import { loadConfig } from "../src/config.js";

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    METEOFRANCE_VIGILANCE_API_TOKEN: "secret-test",
    VIGILANCE_MAX_RETRIES: "0",
    VIGILANCE_CIRCUIT_BREAKER_FAILURES: "1",
    VIGILANCE_CIRCUIT_BREAKER_RESET_SECONDS: "300",
    ...overrides,
  });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof UpstreamError && error.code === code);
}

test("utilise l'en-tête apikey et accepte l'absence facultative de bulletin", async () => {
  const calls: { url: string; headers: Headers }[] = [];
  const client = new MeteoFranceClient(config(), async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return String(input).includes("bulletin") ? new Response(null, { status: 404 }) : json({ product: { periods: [] } });
  });
  const result = await client.fetchProducts();
  assert.equal(result.bulletins, null);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.headers.get("apikey") === "secret-test"));
});

test("refuse une réponse non JSON", async () => {
  const client = new MeteoFranceClient(config(), async () => new Response("html", { status: 200, headers: { "content-type": "text/html" } }));
  await rejectsWithCode(client.fetchProducts(), "UPSTREAM_CONTENT_TYPE_INVALID");
});

test("refuse un JSON invalide", async () => {
  const client = new MeteoFranceClient(config(), async () => new Response("{", { status: 200, headers: { "content-type": "application/json" } }));
  await rejectsWithCode(client.fetchProducts(), "UPSTREAM_JSON_INVALID");
});

test("refuse une réponse trop volumineuse", async () => {
  const client = new MeteoFranceClient(config({ VIGILANCE_MAX_RESPONSE_BYTES: "16" }), async () => json({ payload: "beaucoup trop long" }));
  await rejectsWithCode(client.fetchProducts(), "UPSTREAM_RESPONSE_TOO_LARGE");
});

test("normalise les erreurs HTTP et les délais", async () => {
  const httpClient = new MeteoFranceClient(config(), async () => json({}, 503));
  await rejectsWithCode(httpClient.fetchProducts(), "UPSTREAM_HTTP_ERROR");

  const timeoutClient = new MeteoFranceClient(config(), async () => { throw new DOMException("timeout", "TimeoutError"); });
  await rejectsWithCode(timeoutClient.fetchProducts(), "UPSTREAM_TIMEOUT");
});

test("ouvre le circuit après le seuil d'échecs", async () => {
  let calls = 0;
  const client = new MeteoFranceClient(config(), async () => { calls += 1; throw new Error("offline"); });
  await rejectsWithCode(client.fetchProducts(), "UPSTREAM_UNAVAILABLE");
  const callsAfterFailure = calls;
  await rejectsWithCode(client.fetchProducts(), "CIRCUIT_OPEN");
  assert.equal(calls, callsAfterFailure);
});

test("signale explicitement un jeton absent", async () => {
  const client = new MeteoFranceClient(loadConfig({ VIGILANCE_MAX_RETRIES: "0" }), async () => json({}));
  await rejectsWithCode(client.fetchProducts(), "UPSTREAM_NOT_CONFIGURED");
});
