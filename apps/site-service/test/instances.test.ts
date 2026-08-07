import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInstance, getInstance, transitionerInstance } from "../src/instances.js";
import { poolFactice } from "./helpers.js";

async function dossierTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "site-service-test-"));
}

test("crée une instance : géométrie, index PostgreSQL et manifeste sur disque", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool, queries } = poolFactice();
    const manifeste = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027, title: "Maison" });

    assert.match(manifeste.identity.tileId, /^ODV-\d{4}-\d{6}$/);
    assert.equal(manifeste.status, "created");
    assert.equal(manifeste.review.status, "not_started");
    assert.equal(manifeste.identity.areaM2, 40000);

    const relu = await getInstance(racine, manifeste.identity.tileId);
    assert.deepEqual(relu, manifeste);

    assert.ok(queries.some((q) => /insert into sites\.instances/.test(q.sql)));
    assert.ok(queries.some((q) => /insert into sites\.evenements/.test(q.sql)));
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("refuse des coordonnées hors bornes avant tout accès disque ou base", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool, queries } = poolFactice();
    await assert.rejects(() => createInstance(pool, racine, { lat: 95, lon: 3 }), /latitude invalide/);
    assert.equal(queries.length, 0);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("bascule l'instance en failed si l'écriture du manifeste échoue", async () => {
  const racine = await dossierTemporaire();
  // Un fichier ordinaire à la place du dossier attendu force l'échec du mkdir récursif.
  const cheminObstacle = join(racine, "obstacle");
  await writeFile(cheminObstacle, "");
  try {
    const { pool, queries } = poolFactice();
    await assert.rejects(() => createInstance(pool, cheminObstacle, { lat: 44, lon: 3 }));

    const misesAJour = queries.filter((q) => /update sites\.instances/.test(q.sql));
    assert.equal(misesAJour.length, 1);
    assert.match(misesAJour[0]?.sql ?? "", /status = 'failed'/);
  } finally {
    await rm(dirname(cheminObstacle), { recursive: true, force: true });
  }
});

test("fait avancer le cycle de vie et journalise la revue dans le manifeste et l'index", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool, queries } = poolFactice();
    const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
    const tileId = cree.identity.tileId;

    const collecte = await transitionerInstance(pool, racine, tileId, { versEtat: "collecting" });
    assert.equal(collecte.status, "collecting");

    const genere = await transitionerInstance(pool, racine, tileId, { versEtat: "generated" });
    assert.equal(genere.status, "generated");

    const enRevue = await transitionerInstance(pool, racine, tileId, { versEtat: "review_required", revue: "pending" });
    assert.equal(enRevue.status, "review_required");
    assert.equal(enRevue.review.status, "pending");

    const approuve = await transitionerInstance(pool, racine, tileId, { versEtat: "approved", revue: "approved" });
    assert.equal(approuve.status, "approved");

    const publie = await transitionerInstance(pool, racine, tileId, { versEtat: "published" });
    assert.equal(publie.status, "published");

    const derniereMiseAJourIndex = [...queries].reverse().find((q) => /update sites\.instances/.test(q.sql));
    assert.deepEqual(derniereMiseAJourIndex?.values, [tileId, "published", "approved"]);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("bloque l'entrée en approved sans revue humaine approuvée", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
    const tileId = cree.identity.tileId;
    await transitionerInstance(pool, racine, tileId, { versEtat: "collecting" });
    await transitionerInstance(pool, racine, tileId, { versEtat: "generated" });
    await transitionerInstance(pool, racine, tileId, { versEtat: "review_required", revue: "pending" });

    await assert.rejects(
      () => transitionerInstance(pool, racine, tileId, { versEtat: "approved" }),
      /transition refusée/,
    );
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("permet le retour review_required → collecting sur une correction demandée", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
    const tileId = cree.identity.tileId;
    await transitionerInstance(pool, racine, tileId, { versEtat: "collecting" });
    await transitionerInstance(pool, racine, tileId, { versEtat: "generated" });
    await transitionerInstance(pool, racine, tileId, { versEtat: "review_required", revue: "pending" });

    const retour = await transitionerInstance(pool, racine, tileId, {
      versEtat: "collecting",
      revue: "changes_requested",
    });
    assert.equal(retour.status, "collecting");
    assert.equal(retour.review.status, "changes_requested");
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("refuse de faire transitionner une instance introuvable", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    await assert.rejects(
      () => transitionerInstance(pool, racine, "ODV-2026-999999", { versEtat: "collecting" }),
      /introuvable/,
    );
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});
