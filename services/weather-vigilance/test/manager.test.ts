import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MeteoFranceClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { VigilanceManager } from "../src/manager.js";
import { Metrics } from "../src/metrics.js";
import { SnapshotStore } from "../src/store.js";

const validCard = {
  product: {
    id: "publication-valide",
    update_time: "2026-07-23T14:00:00+02:00",
    periods: [{
      period_id: "J",
      begin_time: "2026-07-23T00:00:00+02:00",
      end_time: "2026-07-24T23:59:00+02:00",
      timelaps: { domain_ids: [{ domain_id: "30", domain_name: "Gard", max_color_id: 2, phenomenon_ids: [{ phenomenon_id: 3, color_id: 2 }] }] },
    }],
  },
};

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "vigilance-manager-"));
  const snapshotPath = join(directory, "snapshot.json");
  const config = loadConfig({
    METEOFRANCE_VIGILANCE_API_TOKEN: "test",
    VIGILANCE_SNAPSHOT_PATH: snapshotPath,
    VIGILANCE_STALE_AFTER_SECONDS: "900",
    VIGILANCE_EXPIRE_AFTER_SECONDS: "21600",
  });
  return { config, snapshotPath, store: new SnapshotStore(snapshotPath) };
}

function client(fetchProducts: () => Promise<{ card: unknown; bulletins: unknown }>): MeteoFranceClient {
  return { fetchProducts } as MeteoFranceClient;
}

test("une réponse invalide ne remplace jamais le dernier état valide", async () => {
  const { config, snapshotPath, store } = await setup();
  let valid = true;
  const manager = new VigilanceManager(
    config,
    client(async () => valid ? { card: validCard, bulletins: {} } : { card: { product: { periods: [] } }, bulletins: {} }),
    store,
    new Metrics(),
    () => new Date("2026-07-23T16:00:00+02:00"),
  );
  await manager.initialize(false);
  assert.equal(await manager.refresh(), true);
  const memoryBefore = JSON.stringify(manager.state.snapshot);
  const diskBefore = await readFile(snapshotPath, "utf8");

  valid = false;
  assert.equal(await manager.refresh(), false);
  assert.equal(JSON.stringify(manager.state.snapshot), memoryBefore);
  assert.equal(await readFile(snapshotPath, "utf8"), diskBefore);
  assert.equal(manager.state.lastError?.code, "UPSTREAM_FORMAT_INVALID");
});

test("restaure le snapshot persistant après redémarrage", async () => {
  const { config, store } = await setup();
  const writer = new VigilanceManager(config, client(async () => ({ card: validCard, bulletins: {} })), store, new Metrics(), () => new Date("2026-07-23T16:00:00+02:00"));
  await writer.initialize(false);
  assert.equal(await writer.refresh(), true);

  const reader = new VigilanceManager(config, client(async () => { throw new Error("offline"); }), store, new Metrics(), () => new Date("2026-07-23T16:05:00+02:00"));
  await reader.initialize(false);
  assert.equal(reader.state.snapshot?.departments["30"]?.departmentName, "Gard");
  assert.equal(reader.state.lastSuccessfulRetrieval, "2026-07-23T14:00:00.000Z");
  assert.equal(reader.freshness(), "fresh");
});

test("distingue fresh, stale et expired", async () => {
  const { config, store } = await setup();
  const manager = new VigilanceManager(config, client(async () => ({ card: validCard, bulletins: {} })), store, new Metrics(), () => new Date("2026-07-23T16:00:00+02:00"));
  await manager.initialize(false);
  await manager.refresh();

  assert.equal(manager.freshness(new Date("2026-07-23T16:10:00+02:00")), "fresh");
  assert.equal(manager.freshness(new Date("2026-07-23T16:20:00+02:00")), "stale");
  assert.equal(manager.freshness(new Date("2026-07-23T23:00:01+02:00")), "expired");
  assert.equal(manager.freshness(new Date("2026-07-25T00:00:00+02:00")), "expired");
});
