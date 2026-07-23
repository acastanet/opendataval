import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { Metrics } from "../src/metrics.js";
import { VigilanceStore } from "../src/store.js";

const validMap = { product: { update_time: "2026-07-23T14:00:00Z", periods: [
  { echeance: "J", begin_validity_time: "2026-07-23T04:00:00Z", end_validity_time: "2026-07-23T22:00:00Z", timelaps: { domain_ids: [{ domain_id: "30", max_color_id: 2, phenomenon_items: [{ phenomenon_id: "3", phenomenon_max_color_id: 2, timelaps_items: [] }] }] } },
  { echeance: "J1", begin_validity_time: "2026-07-23T22:00:00Z", end_validity_time: "2026-07-24T22:00:00Z", timelaps: { domain_ids: [{ domain_id: "30", max_color_id: 1, phenomenon_items: [] }] } },
], meta: { snapshot_id: "s1", product_datetime: "2026-07-23T14:00:00Z" } } };

test("conserve le dernier état valide après une réponse invalide", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vigilance-"));
  const config = loadConfig({ METEOFRANCE_VIGILANCE_API_TOKEN: "x", VIGILANCE_SNAPSHOT_PATH: join(directory, "snapshot.json"), VIGILANCE_STALE_AFTER_SECONDS: "900", VIGILANCE_EXPIRE_AFTER_SECONDS: "21600" });
  let calls = 0;
  const client = { fetchProducts: async () => { calls += 1; return calls === 1 ? { map: validMap, bulletins: null } : { map: {}, bulletins: null }; } } as any;
  const now = () => new Date("2026-07-23T15:00:00Z");
  const store = new VigilanceStore(config, client, new Metrics(), now);
  assert.equal(await store.refresh(), true);
  assert.equal(store.getDepartment("30")?.periods[0]?.overall_level.code, "yellow");
  assert.equal(await store.refresh(), false);
  assert.equal(store.getDepartment("30")?.periods[0]?.overall_level.code, "yellow");
  assert.match(await readFile(config.snapshotPath, "utf8"), /"department_code":"30"/);
  assert.equal(store.getStatus().freshness, "stale");
});

test("restaure le snapshot persistant après redémarrage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vigilance-"));
  const path = join(directory, "snapshot.json");
  const config = loadConfig({ METEOFRANCE_VIGILANCE_API_TOKEN: "x", VIGILANCE_SNAPSHOT_PATH: path, VIGILANCE_STALE_AFTER_SECONDS: "900", VIGILANCE_EXPIRE_AFTER_SECONDS: "21600" });
  const first = new VigilanceStore(config, { fetchProducts: async () => ({ map: validMap, bulletins: null }) } as any, new Metrics(), () => new Date("2026-07-23T15:00:00Z"));
  await first.refresh();
  const second = new VigilanceStore(config, { fetchProducts: async () => { throw new Error("offline"); } } as any, new Metrics(), () => new Date("2026-07-23T15:05:00Z"));
  await second.restore();
  assert.equal(second.getDepartment("30")?.periods[0]?.overall_level.code, "yellow");
  assert.equal(second.getStatus().restored, true);
});
