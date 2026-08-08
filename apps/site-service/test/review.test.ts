import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInstance, transitionerInstance } from "../src/instances.js";
import { publierInstance, traiterRevue } from "../src/review.js";
import { poolFactice } from "./helpers.js";

async function dossierTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "site-service-test-"));
}

/** Amène une instance fraîchement créée jusqu'à `generated`, sans passer par la fabrication réelle. */
async function instanceGeneree(pool: ReturnType<typeof poolFactice>["pool"], racine: string) {
  const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
  await transitionerInstance(pool, racine, cree.identity.tileId, { versEtat: "collecting" });
  return transitionerInstance(pool, racine, cree.identity.tileId, { versEtat: "generated" });
}

test("submit fait passer generated → review_required sans stamper de décision humaine", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const genere = await instanceGeneree(pool, racine);

    const soumise = await traiterRevue(pool, racine, genere.identity.tileId, "submit");
    assert.equal(soumise.status, "review_required");
    assert.equal(soumise.review.status, "pending");
    assert.equal(soumise.review.reviewedAt, null);
    assert.equal(soumise.review.reviewedBy, null);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("approve stampe l'opérateur et la date, puis autorise la publication", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const genere = await instanceGeneree(pool, racine);
    const tileId = genere.identity.tileId;
    await traiterRevue(pool, racine, tileId, "submit");

    const approuvee = await traiterRevue(pool, racine, tileId, "approve", { reviewedBy: "alex", notes: "conforme" });
    assert.equal(approuvee.status, "approved");
    assert.equal(approuvee.review.status, "approved");
    assert.equal(approuvee.review.reviewedBy, "alex");
    assert.equal(approuvee.review.notes, "conforme");
    assert.ok(approuvee.review.reviewedAt, "reviewedAt doit être horodaté");

    const publiee = await publierInstance(pool, racine, tileId);
    assert.equal(publiee.status, "published");
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("request_changes renvoie l'instance en collecte avec le motif de l'opérateur", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const genere = await instanceGeneree(pool, racine);
    const tileId = genere.identity.tileId;
    await traiterRevue(pool, racine, tileId, "submit");

    const corrections = await traiterRevue(pool, racine, tileId, "request_changes", {
      reviewedBy: "alex",
      notes: "altitude manquante",
    });
    assert.equal(corrections.status, "collecting");
    assert.equal(corrections.review.status, "changes_requested");
    assert.equal(corrections.review.notes, "altitude manquante");
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("refuse d'approuver une instance qui n'est pas encore en revue", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const genere = await instanceGeneree(pool, racine);

    await assert.rejects(
      () => traiterRevue(pool, racine, genere.identity.tileId, "approve", { reviewedBy: "alex" }),
      /transition refusée/,
    );
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("refuse de publier une instance non approuvée", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const genere = await instanceGeneree(pool, racine);
    await traiterRevue(pool, racine, genere.identity.tileId, "submit");

    await assert.rejects(() => publierInstance(pool, racine, genere.identity.tileId), /transition refusée/);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("refuse de traiter la revue d'une instance introuvable", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    await assert.rejects(() => traiterRevue(pool, racine, "ODV-2026-999999", "submit"), /introuvable/);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});
