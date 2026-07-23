import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { Metrics } from "../src/metrics.js";

const config = loadConfig({ METEOFRANCE_VIGILANCE_API_TOKEN: "x" });
const department = { department_code: "30", department_name: "Gard", periods: [{ day: "today", date: "2026-07-23", overall_level: { code: "yellow", rank: 1, label: "Vigilance jaune" }, phenomena: [], valid_from: null, valid_until: "2026-07-24T00:00:00Z" }], bulletins: [{ scope: "department", scope_code: "30", title: "Bulletin", text: "Officiel", issued_at: null, valid_from: null, valid_until: null, source_id: "b1" }], warnings: [] };
function store(serve = true) { return { canServe: () => serve, getStatus: () => ({ freshness: serve ? "fresh" : "expired", lastAttempt: null, lastSuccess: serve ? "2026-07-23T15:00:00Z" : null, lastError: null, restored: false }), getDepartment: (code: string) => code === "30" ? department : null, getSnapshot: () => serve ? ({ retrieved_at: "2026-07-23T15:00:00Z", issued_at: "2026-07-23T14:00:00Z", publication_id: "s1", warnings: [] }) : null, cacheAgeSeconds: () => 60 } as any; }

test("ne transforme pas une indisponibilité en vigilance verte", async () => {
  const app = buildApp({ config, store: store(false), metrics: new Metrics(), logger: false });
  const response = await app.inject({ method: "GET", url: "/v1/vigilance/departments/30" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().freshness_status, "expired");
  assert.equal(response.json().periods, undefined);
  await app.close();
});

test("retourne le Gard et masque les bulletins par défaut", async () => {
  const app = buildApp({ config, store: store(), metrics: new Metrics(), logger: false });
  const response = await app.inject({ method: "GET", url: "/v1/vigilance/departments/30" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().location.department_name, "Gard");
  assert.deepEqual(response.json().bulletins, []);
  const withBulletin = await app.inject({ method: "GET", url: "/v1/vigilance/departments/30?include_bulletins=true" });
  assert.equal(withBulletin.json().bulletins[0].text, "Officiel");
  await app.close();
});

test("accepte 2A et refuse 20", async () => {
  const app = buildApp({ config, store: store(), metrics: new Metrics(), logger: false });
  assert.notEqual((await app.inject({ method: "GET", url: "/v1/vigilance/departments/2A" })).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/v1/vigilance/departments/20" })).statusCode, 400);
  await app.close();
});
