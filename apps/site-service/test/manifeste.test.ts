import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { empriseDalle } from "@opendata-vda/shared/dalle-geometrie";
import {
  construireManifesteInitial,
  depuisManifesteJson,
  ecrireManifesteAtomique,
  lireManifeste,
  repertoireInstance,
  versManifesteJson,
} from "../src/manifeste.js";

const TILE_ID = "ODV-2026-000001";
const EMPRISE = empriseDalle(44.064555, 3.683027);

test("le manifeste initial est en created, sans donnée, revue non commencée", () => {
  const manifeste = construireManifesteInitial(TILE_ID, EMPRISE, "Maison");
  assert.equal(manifeste.status, "created");
  assert.equal(manifeste.review.status, "not_started");
  assert.deepEqual(manifeste.data, {});
  assert.equal(manifeste.identity.widthM, 200);
  assert.equal(manifeste.identity.areaM2, 40000);
});

test("fait l'aller-retour JSON sans perte sur un manifeste initial", () => {
  const manifeste = construireManifesteInitial(TILE_ID, EMPRISE, "Maison");
  const json = versManifesteJson(manifeste);
  assert.equal((json.identity as Record<string, unknown>).tile_id, TILE_ID);
  assert.equal((json.identity as Record<string, unknown>).width_m, 200);

  const relu = depuisManifesteJson(json);
  assert.deepEqual(relu, manifeste);
});

test("écrit puis relit atomiquement un manifeste sur disque", async () => {
  const racine = await mkdtemp(join(tmpdir(), "site-service-test-"));
  try {
    const dir = repertoireInstance(racine, TILE_ID);
    const manifeste = construireManifesteInitial(TILE_ID, EMPRISE, "Maison");
    await ecrireManifesteAtomique(dir, manifeste);

    const relu = await lireManifeste(dir);
    assert.deepEqual(relu, manifeste);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("renvoie null pour une instance qui n'existe pas encore", async () => {
  const racine = await mkdtemp(join(tmpdir(), "site-service-test-"));
  try {
    const relu = await lireManifeste(repertoireInstance(racine, "ODV-2026-999999"));
    assert.equal(relu, null);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});
