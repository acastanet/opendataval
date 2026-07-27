import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { SnapshotStore, normalizeManifest } from "../src/store.js";
import { synchronizeRna } from "../src/sync.js";
import { gzipSync } from "node:zlib";
import type { Snapshot } from "../src/types.js";

const WALDEC = join(import.meta.dirname, "fixtures", "waldec.csv");
const IMPORT = join(import.meta.dirname, "fixtures", "import.csv");

/** Renvoie un fetch simulé qui sert un fichier local comme flux CSV. */
function localFetch(file: string, url: string) {
  return (async (input: string | URL | Request) => {
    const target = String(input);
    const path = target === url ? file : file;
    const content = await readFile(path);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(content));
        controller.close();
      },
    });
    return new Response(stream as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: { "content-type": "text/csv" },
    });
  }) as typeof fetch;
}

function geocodingStub() {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const q = url.searchParams.get("q") ?? "";
    // Repli municipal pour les requêtes hors centre.
    const atMunicipality = /VALLERAUGUE|ROUVIERE/.test(q);
    return new Response(
      JSON.stringify({
        features: atMunicipality
          ? [
              {
                geometry: { coordinates: [3.6421, 44.0812] },
                properties: { score: 0.91, type: "municipality" },
              },
            ]
          : [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

function makeConfig(dir: string, waldecUrl: string, importUrl: string) {
  const base = loadConfig({});
  return {
    ...base,
    dataDir: dir,
    snapshotPath: join(dir, "associations-30339.json.gz"),
    waldecSourceUrl: waldecUrl,
    importSourceUrl: importUrl,
    geocodingUrl: "https://example.test/geocodage/search",
    geocodingTimeoutMs: 1000,
    downloadTimeoutMs: 5000,
  };
}

function makeLegacyConfig(dir: string, sourceUrl: string) {
  const config = makeConfig(dir, "unused://waldec", "unused://import");
  return {
    ...config,
    waldecSourceUrl: undefined,
    importSourceUrl: undefined,
    rnaSourceUrl: sourceUrl,
  };
}

test("importe et fusionne Waldec + Import, déduplique sans fusion par titre", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = makeConfig(dir, "waldec://local", "import://local");
  const store = new SnapshotStore(config.snapshotPath);
  await synchronizeRna(
    config,
    store,
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("geocodage")) return geocodingStub()(input, init);
      return localFetch(url.includes("import") ? IMPORT : WALDEC, url)(input, init);
    }) as typeof fetch,
  );

  const snapshot = store.current()!;
  assert.ok(snapshot, "snapshot non nul");
  // 30339: W303000001, W303000002, W301900001 ; Import: 0031900001
  // W303000001 est commun à Waldec et Import -> dédupliqué (1 occurrence).
  const ids = snapshot.associations
    .map((a) => a.rnaId ?? a.legacyId)
    .sort();
  assert.deepEqual(
    ids,
    ["0031900001", "W301900001", "W303000001", "W303000002"].sort(),
  );
  // Aucune association NIMES (30000) ni doublon.
  assert.equal(snapshot.associations.length, 4);
  // Provenance : deux sources.
  assert.equal(snapshot.manifest.sources.length, 2);
  const waldec = snapshot.manifest.sources.find((s) => s.kind === "waldec")!;
  const imported = snapshot.manifest.sources.find((s) => s.kind === "import")!;
  assert.equal(waldec.rowsRead, 4);
  assert.equal(waldec.rowsKept, 3); // hors périmètre NIMES rejeté
  assert.equal(imported.rowsKept, 2); // hors périmètre NIMES rejeté
  // Toutes les lignes sont rattachées à 30339.
  assert.ok(
    snapshot.associations.every(
      (a) => a.address.normalizedCommuneCode === "30339",
    ),
  );
  // Géocodage appliqué.
  assert.ok(snapshot.associations.every((a) => a.location !== null));
});

test("refuse un fichier dont les colonnes obligatoires manquent", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const badPath = join(dir, "bad.csv");
  await writeFile(badPath, "foo,bar\n1,2\n");
  const config = makeLegacyConfig(dir, "bad://local");
  const store = new SnapshotStore(config.snapshotPath);
  await assert.rejects(
    () => synchronizeRna(config, store, localFetch(badPath, "bad://local")),
    /colonnes obligatoires manquantes/,
  );
});

test("préserve le snapshot précédent si une source échoue", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Snapshot valide préexistant.
  const previous: Snapshot = {
    schemaVersion: 1,
    associations: [
      {
        rnaId: "W999999999",
        legacyId: null,
        title: "Ancienne association",
        shortTitle: null,
        purpose: null,
        categoryPrimary: null,
        categorySecondary: null,
        administrativeStatus: "active",
        creationDate: null,
        declarationDate: null,
        dissolutionDate: null,
        website: null,
        siren: null,
        siret: null,
        address: {
          label: null,
          street: null,
          postalCode: null,
          municipalityName: "VALLERAUGUE",
          sourceCommuneCode: "30339",
          normalizedCommuneCode: "30339",
        },
        location: null,
        source: { name: "RNA", sourceUpdatedAt: null, importedAt: "2020-01-01T00:00:00Z" },
      },
    ],
    manifest: {
      schemaVersion: 1,
      generatedAt: "2020-01-01T00:00:00Z",
      sources: [],
      totalRowsRead: 1,
      totalRowsKept: 1,
      totalRowsRejected: 0,
    },
  };
  await writeFile(join(dir, "associations-30339.json.gz"), gzipSync(JSON.stringify(previous)));
  const config = makeConfig(dir, "waldec://local", "import://local");
  const store = new SnapshotStore(config.snapshotPath);
  await store.restore();
  assert.equal(store.current()!.associations.length, 1);
  // Import échoue : on sert un fetch qui lève.
  const halfFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("import")) throw new Error("réseau Import indisponible");
    return localFetch(WALDEC, "waldec://local")(input, init);
  }) as typeof fetch;
  await assert.rejects(() => synchronizeRna(config, store, halfFetch));
  // Le snapshot précédent est intact.
  assert.equal(store.current()!.associations.length, 1);
  assert.equal(store.current()!.associations[0]!.rnaId, "W999999999");
});

test("préserve le snapshot précédent si le snapshot produit est vide", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const previous: Snapshot = {
    schemaVersion: 1,
    associations: [
      {
        rnaId: "W888888888",
        legacyId: null,
        title: "Précédent",
        shortTitle: null,
        purpose: null,
        categoryPrimary: null,
        categorySecondary: null,
        administrativeStatus: "active",
        creationDate: null,
        declarationDate: null,
        dissolutionDate: null,
        website: null,
        siren: null,
        siret: null,
        address: {
          label: null,
          street: null,
          postalCode: null,
          municipalityName: "VALLERAUGUE",
          sourceCommuneCode: "30339",
          normalizedCommuneCode: "30339",
        },
        location: null,
        source: { name: "RNA", sourceUpdatedAt: null, importedAt: "2020-01-01T00:00:00Z" },
      },
    ],
    manifest: {
      schemaVersion: 1,
      generatedAt: "2020-01-01T00:00:00Z",
      sources: [],
      totalRowsRead: 1,
      totalRowsKept: 1,
      totalRowsRejected: 0,
    },
  };
  await writeFile(join(dir, "associations-30339.json.gz"), gzipSync(JSON.stringify(previous)));
  // Sources ne contenant que des communes hors périmètre -> résultat vide.
  const emptyPath = join(dir, "empty.csv");
  await writeFile(
    emptyPath,
    "id,id_ex,titre,adrs_codeinsee,adrs_codepostal,adrs_libcommune,position,maj_time\nW300000001,,Hors perimetre,,30000,NIMES,A,2021-08-06 15:57:08\n",
  );
  const config = makeLegacyConfig(dir, "empty://local");
  const store = new SnapshotStore(config.snapshotPath);
  await store.restore();
  await assert.rejects(
    () => synchronizeRna(config, store, localFetch(emptyPath, "empty://local")),
    /aucune association/,
  );
  assert.equal(store.current()!.associations.length, 1);
});

test("refuse une configuration nationale avec une seule source", async () => {
  const config = {
    ...loadConfig({}),
    waldecSourceUrl: "waldec://local",
    importSourceUrl: undefined,
  };
  const store = new SnapshotStore("unused");

  await assert.rejects(
    () => synchronizeRna(config, store),
    /doivent être configurées ensemble/,
  );
});

test("lit un ancien manifeste mono-source (rétrocompatibilité)", () => {
  const legacy = {
    schemaVersion: 1,
    generatedAt: "2020-01-01T00:00:00Z",
    sourceUrl: "http://legacy",
    sha256: "abc",
    sourceUpdatedAt: null,
    rowCount: 5,
  };
  const normalized = normalizeManifest(legacy);
  assert.equal(normalized.sources.length, 1);
  assert.equal(normalized.totalRowsKept, 5);
});

test("met à jour immédiatement le store en mémoire après synchronisation interne", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "assoc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = makeConfig(dir, "waldec://local", "import://local");
  const store = new SnapshotStore(config.snapshotPath);
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("geocodage")) return geocodingStub()(input, init);
    return localFetch(url.includes("import") ? IMPORT : WALDEC, url)(input, init);
  }) as typeof fetch;
  await synchronizeRna(config, store, fetchImpl);
  // Le store en mémoire reflète déjà le nouveau snapshot.
  assert.ok(store.current());
  assert.equal(store.current()!.associations.length, 4);
});
