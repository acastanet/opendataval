import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const card = { product: { id: "p", update_time: "2026-07-23T16:00:00+02:00", periods: [{ period_id: "J", begin_time: "2026-07-23T00:00:00+02:00", end_time: "2026-07-24T00:00:00+02:00", timelaps: { domain_ids: [{ domain_id: "30", domain_name: "Gard", max_color_id: "2", phenomenon_ids: [{ phenomenon_id: 3, color_id: 2 }] }] } }] } };
const bulletin = { bulletins: [{ id: "b", type: "department", department_code: "30", text: "Bulletin officiel" }] };

async function config(overrides: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "vigilance-"));
  return loadConfig({ METEOFRANCE_VIGILANCE_API_TOKEN: "secret", VIGILANCE_SNAPSHOT_PATH: join(directory, "snapshot.json"), VIGILANCE_STALE_AFTER_SECONDS: "900", VIGILANCE_EXPIRE_AFTER_SECONDS: "21600", ...overrides });
}

test("sert le Gard, les bulletins et persiste le dernier état valide", async () => {
  const conf = await config(); let calls = 0;
  const fetchImpl: typeof fetch = async (input) => { calls += 1; return String(input).includes("bulletin") ? response(bulletin) : response(card); };
  const app = await buildApp({ config: conf, fetchImpl, logger: false, startScheduler: true, now: () => new Date("2026-07-23T16:05:00+02:00") });
  for (let i = 0; i < 20; i += 1) { const ready = await app.inject({ method: "GET", url: "/readyz" }); if (ready.statusCode === 200) break; await new Promise((resolve) => setTimeout(resolve, 10)); }
  const result = await app.inject({ method: "GET", url: "/v1/vigilance/departments/30?include_bulletins=true" });
  assert.equal(result.statusCode, 200);
  const json = result.json();
  assert.equal(json.freshness_status, "fresh");
  assert.equal(json.periods[0].overall_level.code, "yellow");
  assert.equal(json.bulletins[0].text, "Bulletin officiel");
  assert.ok(calls >= 2);
  assert.ok((await readFile(conf.snapshotPath, "utf8")).includes('"departmentCode":"30"'));
  await app.close();
});

test("une source indisponible ne devient jamais verte", async () => {
  const conf = await config();
  const app = await buildApp({ config: conf, fetchImpl: async () => { throw new Error("offline"); }, logger: false, startScheduler: true, now: () => new Date("2026-07-23T16:05:00+02:00") });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const result = await app.inject({ method: "GET", url: "/v1/vigilance/departments/30" });
  assert.equal(result.statusCode, 503);
  assert.equal(result.json().data_status, "unavailable");
  assert.equal(result.json().periods, undefined);
  await app.close();
});

test("valide les codes 2A et 2B et rejette les codes mal formés", async () => {
  const conf = await config();
  const app = await buildApp({ config: conf, fetchImpl: async (input) => String(input).includes("bulletin") ? response({}) : response({ product: { periods: [{ timelaps: { domain_ids: [{ domain_id: "2A", max_color_id: 1, phenomenon_ids: [] }, { domain_id: "2B", max_color_id: 1, phenomenon_ids: [] }] } }] } }), logger: false, startScheduler: true });
  for (let i = 0; i < 20; i += 1) { if ((await app.inject({ method: "GET", url: "/readyz" })).statusCode === 200) break; await new Promise((resolve) => setTimeout(resolve, 10)); }
  assert.equal((await app.inject({ method: "GET", url: "/v1/vigilance/departments/2A" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/v1/vigilance/departments/2B" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/v1/vigilance/departments/3" })).statusCode, 400);
  await app.close();
});
