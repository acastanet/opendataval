import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { FirmsClient } from "../src/firms-client.js";

const csv = [
  "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,type",
  "44.1,3.1,2026-07-24,2030,N21,VIIRS,n,5.1,N,0",
].join("\n");

test("interroge quatre capteurs et deux fenêtres pour sept jours", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(csv, { status: 200 }); }) as typeof fetch;
  const config = loadConfig({ NASA_FIRMS_MAP_KEY: "test", FIRMS_MAX_RETRIES: "0" });
  const client = new FirmsClient(config, fetchImpl, () => new Date("2026-07-24T21:00:00Z"));
  const result = await client.fetchNearby(44, 3, 50, 7);
  assert.equal(calls.length, 8);
  assert.equal(result.reports.length, 4);
  assert.ok(result.detections.length >= 1);
  assert.ok(calls.some((url) => url.endsWith("/2/2026-07-18")));
});

test("indique explicitement une clé absente", async () => {
  const client = new FirmsClient(loadConfig({}), async () => { throw new Error("ne doit pas être appelé"); });
  const result = await client.fetchNearby(44, 3, 50, 7);
  assert.equal(result.reports.every((report) => report.state === "not_configured"), true);
});
