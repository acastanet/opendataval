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

test("convertit les nouveaux champs de scène vers le contrat snake_case", () => {
  const manifeste = construireManifesteInitial(TILE_ID, EMPRISE, "Maison");
  manifeste.scene = {
    glb: "/assets/scene.glb",
    terrain: null,
    orthophoto: "/assets/ortho.webp",
    metadata: "/assets/scene.json",
    sourcePoints: { glb: "/assets/source.glb", metadata: null },
    orthophotoCalage: { estM: 0.4, nordM: -0.2 },
    geology: { texture: "/assets/geology.png", pick: "/assets/geology-pick.png", metadata: "/assets/geology.json" },
    terrainBbox: [754601.0, 6329635.0, 754831.0, 6329865.0],
    orthophotoSizePx: 2048,
    orthophotoResolutionM: 0.1123046875,
  };

  const json = versManifesteJson(manifeste);
  assert.deepEqual(json.scene, {
    glb: "/assets/scene.glb",
    terrain: null,
    orthophoto: "/assets/ortho.webp",
    metadata: "/assets/scene.json",
    source_points: { glb: "/assets/source.glb", metadata: null },
    orthophoto_calage: { est_m: 0.4, nord_m: -0.2 },
    geology: { texture: "/assets/geology.png", pick: "/assets/geology-pick.png", metadata: "/assets/geology.json" },
    terrain_bbox: [754601.0, 6329635.0, 754831.0, 6329865.0],
    orthophoto_size_px: 2048,
    orthophoto_resolution_m: 0.1123046875,
  });
  assert.deepEqual(depuisManifesteJson(json), manifeste);
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
