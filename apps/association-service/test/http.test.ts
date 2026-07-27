import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { buildApp } from "../src/app.js";
import type { AssociationConfig } from "../src/config.js";
import { SnapshotStore } from "../src/store.js";
import { synchronizeRna } from "../src/sync.js";
import type { Snapshot } from "../src/types.js";
import { localFetchForTest, geocodingStubForTest } from "./helpers.js";

const WALDEC = join(import.meta.dirname, "fixtures", "waldec.csv");
const IMPORT = join(import.meta.dirname, "fixtures", "import.csv");

const config: AssociationConfig = {
  host: "127.0.0.1",
  port: 3000,
  dataDir: ".",
  snapshotPath: "unused",
  version: "test",
  geocodingUrl: "https://example.test/geocodage/search",
  geocodingTimeoutMs: 1000,
  downloadTimeoutMs: 5000,
};

function seededSnapshot(): Snapshot {
  return {
    schemaVersion: 1,
    associations: [
      {
        rnaId: "W303000001",
        legacyId: null,
        title: "Mémoire de l'Aigoual",
        shortTitle: null,
        purpose: "Patrimoine local",
        categoryPrimary: "002000 - CULTURE ET ARTS",
        categorySecondary: "002055 : Sauvegarde du patrimoine culturel et historique",
        administrativeStatus: "active",
        creationDate: "2020-01-01",
        declarationDate: null,
        dissolutionDate: null,
        website: null,
        siren: null,
        siret: null,
        address: {
          label: "Valleraugue",
          street: null,
          postalCode: "30570",
          municipalityName: "VALLERAUGUE",
          sourceCommuneCode: "30339",
          normalizedCommuneCode: "30339",
        },
        location: { latitude: 44.08, longitude: 3.64, precision: "address", score: 0.9 },
        source: { name: "RNA", sourceUpdatedAt: null, importedAt: "2026-01-01T00:00:00Z" },
      },
      {
        rnaId: null,
        legacyId: "L30190",
        title: "Sport Notre-Dame",
        shortTitle: null,
        purpose: null,
        categoryPrimary: "001000 - SPORTS",
        categorySecondary: "001005 : Football, futsal",
        administrativeStatus: "unknown",
        creationDate: null,
        declarationDate: null,
        dissolutionDate: null,
        website: null,
        siren: "1",
        siret: null,
        address: {
          label: null,
          street: null,
          postalCode: "30570",
          municipalityName: "NOTRE-DAME-DE-LA-ROUVIERE",
          sourceCommuneCode: "30190",
          normalizedCommuneCode: "30339",
        },
        location: null,
        source: { name: "RNA", sourceUpdatedAt: null, importedAt: "2026-01-01T00:00:00Z" },
      },
    ],
    manifest: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sources: [
        {
          kind: "waldec",
          url: "waldec://local",
          httpStatus: 200,
          contentType: "text/csv",
          sha256: "a",
          bytes: 1,
          sourceUpdatedAt: null,
          rowsRead: 1,
          rowsKept: 1,
          rowsRejected: 0,
          fetchedAt: new Date().toISOString(),
        },
      ],
      totalRowsRead: 1,
      totalRowsKept: 1,
      totalRowsRejected: 0,
    },
  };
}

test("GET /healthz et /readyz", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());
  assert.equal((await app.inject("/healthz")).statusCode, 200);
  assert.equal((await app.inject("/readyz")).statusCode, 503);
});

test("recherche sans accent, fiche, stats et carte GeoJSON", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-http-seeded-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new SnapshotStore(join(dir, "associations-30339.json.gz"));
  await store.replace(seededSnapshot());
  const app = buildApp({ config, store, logger: false });
  t.after(() => app.close());

  const list = await app.inject("/api/v2/associations?code_insee=30339&q=memOire");
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().total, 1);

  const primaryCategory = await app.inject("/api/v2/associations?code_insee=30339&category_primary=001000");
  assert.equal(primaryCategory.statusCode, 200);
  assert.equal(primaryCategory.json().items[0].title, "Sport Notre-Dame");

  const secondaryCategory = await app.inject("/api/v2/associations?code_insee=30339&category_secondary=002055");
  assert.equal(secondaryCategory.statusCode, 200);
  assert.equal(secondaryCategory.json().items[0].title, "Mémoire de l'Aigoual");

  const byId = await app.inject("/api/v2/associations/L30190");
  assert.equal(byId.statusCode, 200);
  assert.equal(byId.json().item.legacyId, "L30190");

  const stats = (await app.inject("/api/v2/associations/stats?code_insee=30339")).json();
  assert.equal(stats.total, 2);
  assert.equal(stats.byStatus.active, 1);

  const map = await app.inject("/api/v2/associations/map?code_insee=30339");
  assert.equal(map.json().type, "FeatureCollection");
  assert.equal(map.json().features.length, 1);
});

test("refuse un code INSEE invalide et une limite > 100", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-http-invalid-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new SnapshotStore(join(dir, "associations-30339.json.gz"));
  await store.replace(seededSnapshot());
  const app = buildApp({ config, store, logger: false });
  t.after(() => app.close());
  assert.equal(
    (await app.inject("/api/v2/associations?code_insee=3033")).statusCode,
    400,
  );
  assert.equal(
    (await app.inject("/api/v2/associations?code_insee=30339&limit=101")).statusCode,
    400,
  );
});

test("snapshot indisponible renvoie 503", async (t) => {
  const app = buildApp({ config, logger: false });
  t.after(() => app.close());
  assert.equal(
    (await app.inject("/api/v2/associations?code_insee=30339")).statusCode,
    503,
  );
  assert.equal(
    (await app.inject("/api/v2/associations/stats?code_insee=30339")).statusCode,
    503,
  );
});

test("POST /sync sans token est refusé ; avec token, met à jour sans redémarrage", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-http-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const securedConfig: AssociationConfig = {
    ...config,
    dataDir: dir,
    snapshotPath: join(dir, "associations-30339.json.gz"),
    syncToken: "secret-test",
    waldecSourceUrl: "waldec://local",
    importSourceUrl: "import://local",
  };
  const store = new SnapshotStore(securedConfig.snapshotPath);
  const app = buildApp({
    config: securedConfig,
    store,
    logger: false,
    sync: async (s) =>
      synchronizeRna(securedConfig, s, (async (input, init) => {
        const url = String(input);
        if (url.includes("geocodage")) return geocodingStubForTest()(input as string, init);
        return localFetchForTest(url.includes("import") ? IMPORT : WALDEC, url as string)(input as string, init);
      }) as typeof fetch),
  });
  t.after(() => app.close());

  // Sans token -> 401.
  const unauthorized = await app.inject({
    method: "POST",
    url: "/internal/v1/associations/sync",
  });
  assert.equal(unauthorized.statusCode, 401);

  // Avec token -> 202 et store actualisé immédiatement.
  const authorized = await app.inject({
    method: "POST",
    url: "/internal/v1/associations/sync",
    headers: { authorization: "Bearer secret-test" },
  });
  assert.equal(authorized.statusCode, 202);

  const list = await app.inject("/api/v2/associations?code_insee=30339");
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().total, 4);
  assert.equal(list.json().source.snapshotUpdatedAt !== null, true);

  // La route de statut interne expose les deux provenances.
  const status = (await app.inject("/internal/v1/associations/status")).json();
  assert.equal(status.snapshot.sources.length, 2);
});
