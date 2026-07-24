import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { EumetsatClient, entryCandidates, productIds } from "../src/eumetsat-client.js";

test("extrait les identifiants produits et les entrées XML", () => {
  assert.deepEqual(productIds({ features: [{ id: "product-1", properties: { identifier: "product-1" } }] }), ["product-1"]);
  assert.equal(entryCandidates({ links: [{ href: "https://example.test/files/fire.cap.xml" }] }, "product-1")[0], "fire.cap.xml");
});

test("cherche, authentifie et télécharge un CAP", async () => {
  const calls: string[] = [];
  const cap = `<alert><identifier>x</identifier><sent>2026-07-24T20:40:00Z</sent><info><certainty>Likely</certainty><area><circle>44.1,3.1 1</circle></area></info></alert>`;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.includes("/token")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
    if (url.includes("search-products")) return new Response(JSON.stringify({ features: [{ properties: { identifier: "product-1" } }] }), { status: 200 });
    if (url.includes("/browse/")) return new Response(JSON.stringify({ entries: ["fire.xml"] }), { status: 200 });
    if (url.includes("/entry")) return new Response(cap, { status: 200, headers: { "content-type": "application/xml" } });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const config = loadConfig({ EUMETSAT_CONSUMER_KEY: "key", EUMETSAT_CONSUMER_SECRET: "secret" });
  const client = new EumetsatClient(config, fetchImpl, () => new Date("2026-07-24T21:00:00Z"));
  const result = await client.fetchCollection(config.eumetsatMtgCollection, "EUMETSAT_MTG_CAP", 44, 3, 50);
  assert.equal(result.reports[0]?.state, "available");
  assert.equal(result.detections.length, 1);
  assert.ok(calls.some((url) => url.includes("access_token=token")));
});
