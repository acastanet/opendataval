import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { Metrics } from "../src/metrics.js";
import { MeteoFranceClient, UpstreamError } from "../src/source-client.js";

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    METEOFRANCE_VIGILANCE_API_TOKEN: "secret",
    METEOFRANCE_VIGILANCE_API_URL: "https://example.test/v1",
    VIGILANCE_MAX_RETRIES: "0",
    VIGILANCE_CIRCUIT_FAILURE_THRESHOLD: "1",
    VIGILANCE_CIRCUIT_OPEN_SECONDS: "60",
    ...overrides,
  });
}

test("utilise l'authentification apikey sans exposer le jeton dans la réponse", async () => {
  const calls: RequestInit[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ product: {} }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  await new MeteoFranceClient(config(), new Metrics(), fetchImpl).fetchProducts();
  assert.equal(new Headers(calls[0]?.headers).get("apikey"), "secret");
  assert.equal(new Headers(calls[0]?.headers).get("authorization"), null);
});

test("accepte l'absence normale du produit textes", async () => {
  let call = 0;
  const fetchImpl = (async () => {
    call += 1;
    return call === 1
      ? new Response(JSON.stringify({ product: {} }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(null, { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const result = await new MeteoFranceClient(config(), new Metrics(), fetchImpl).fetchProducts();
  assert.equal(result.bulletins, null);
});

test("refuse un contenu non JSON et ouvre le circuit", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls += 1; return new Response("html", { status: 200, headers: { "content-type": "text/html" } }); }) as typeof fetch;
  const client = new MeteoFranceClient(config(), new Metrics(), fetchImpl, () => 1_000);
  await assert.rejects(() => client.fetchProducts(), (error: unknown) => error instanceof UpstreamError && error.code === "UPSTREAM_CONTENT_TYPE");
  await assert.rejects(() => client.fetchProducts(), (error: unknown) => error instanceof UpstreamError && error.code === "CIRCUIT_OPEN");
  assert.equal(calls, 1);
});

test("refuse une réponse dépassant la taille maximale", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ product: { value: "x".repeat(100) } }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const client = new MeteoFranceClient(config({ VIGILANCE_MAX_RESPONSE_BYTES: "32" }), new Metrics(), fetchImpl);
  await assert.rejects(() => client.fetchProducts(), (error: unknown) => error instanceof UpstreamError && error.code === "UPSTREAM_TOO_LARGE");
});
