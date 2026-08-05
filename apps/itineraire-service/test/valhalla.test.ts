import assert from "node:assert/strict";
import test from "node:test";
import type { ItineraireConfig } from "../src/config.js";
import { createValhallaClient, ValhallaRouteError } from "../src/valhalla.js";

const config: ItineraireConfig = { host: "127.0.0.1", port: 3000, version: "test", valhallaUrl: "http://valhalla.test", valhallaTimeoutMs: 100, restrictionsFile: "missing.json" };

test("lit les ways et les segments renvoyés au premier niveau par trace_attributes", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (String(input).endsWith("/route")) return Response.json({ trip: { summary: { time: 12, length: 0.1 }, legs: [{ shape: "????", maneuvers: [] }] } });
    return Response.json({ shape: "????", edges: [{ way_id: 42, length: 0.1, names: ["Rue test"], begin_shape_index: 0, end_shape_index: 1 }] });
  }) as typeof fetch;
  const result = await createValhallaClient(config, fetchImpl).route({ lonDepart: 0, latDepart: 0, lonArrivee: 0, latArrivee: 0, hauteurM: 4, largeurM: 2.5, longueurM: 16, poidsT: 38, chargeEssieuT: 11, nbEssieux: 5, matieresDangereuses: false }, "truck");
  assert.equal(result.edges[0]?.wayId, "42");
  assert.equal(result.edges[0]?.geometry?.type, "LineString");
  assert.equal((requests[0]?.body.locations as Array<{ radius: number }>)[0]?.radius, 200);
  assert.deepEqual((requests[1]?.body.filters as { attributes: string[] }).attributes.includes("edge.begin_shape_index"), true);
});

test("distingue le refus de routage de l’indisponibilité du moteur", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ error: "No suitable edges near location" }), { status: 400 })) as typeof fetch;
  await assert.rejects(
    createValhallaClient(config, fetchImpl).route({ lonDepart: 0, latDepart: 0, lonArrivee: 0, latArrivee: 0, hauteurM: 4, largeurM: 2.5, longueurM: 16, poidsT: 38, chargeEssieuT: 11, nbEssieux: 5, matieresDangereuses: false }, "truck"),
    (error: unknown) => error instanceof ValhallaRouteError && error.message === "Valhalla a refusé la demande (HTTP 400).",
  );
});
