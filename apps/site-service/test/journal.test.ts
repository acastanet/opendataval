import test from "node:test";
import assert from "node:assert/strict";
import { demarrerEtape, terminerEtape } from "../src/journal.js";
import { poolFactice } from "./helpers.js";

test("journalise le début puis la fin d'une étape", async () => {
  const { pool, queries } = poolFactice();
  const id = await demarrerEtape(pool, "ODV-2026-000001", "creation");
  assert.equal(id, 1);
  assert.match(queries[0]?.sql ?? "", /insert into sites\.evenements/);
  assert.deepEqual(queries[0]?.values, ["ODV-2026-000001", "creation"]);

  await terminerEtape(pool, id, "succes");
  assert.match(queries[1]?.sql ?? "", /update sites\.evenements/);
  assert.deepEqual(queries[1]?.values, [1, "succes", null]);
});

test("conserve le message d'erreur d'une étape échouée", async () => {
  const { pool, queries } = poolFactice();
  const id = await demarrerEtape(pool, "ODV-2026-000001", "ecriture_manifeste");
  await terminerEtape(pool, id, "echec", "ENOSPC");
  assert.deepEqual(queries[1]?.values, [1, "echec", "ENOSPC"]);
});
