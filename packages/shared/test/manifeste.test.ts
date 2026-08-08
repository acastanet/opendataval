import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/**
 * Valide `agent/mvp/schemas/tile-manifest.schema.json` — le contrat de fichier que
 * `site-service` devra produire — plutôt que les types TypeScript de `dalle.ts`, qui sont une
 * représentation interne distincte (voir l'en-tête de `../src/dalle.ts`).
 */
const CHEMIN_SCHEMA = fileURLToPath(
  new URL("../../../agent/mvp/schemas/tile-manifest.schema.json", import.meta.url),
);
const schema = JSON.parse(readFileSync(CHEMIN_SCHEMA, "utf-8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const valider = ajv.compile(schema);

function manifesteExemplaire(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    identity: {
      tile_id: "ODV-2026-000001",
      title: "Maison",
      center: { lat: 44.064555, lon: 3.683027 },
      width_m: 200,
      height_m: 200,
      area_m2: 40000,
      geometry_wgs84: { type: "Polygon", coordinates: [[[3.6819, 44.0636], [3.6842, 44.0636], [3.6842, 44.0655], [3.6819, 44.0655], [3.6819, 44.0636]]] },
    },
    production: {
      created_at: "2026-08-07T10:00:00.000Z",
      pipeline_version: "0.1.0",
    },
    status: "generated",
    data: {
      atmosphere: [
        {
          key: "temperature_air",
          value: 22.7,
          unit: "°C",
          sphere: "atmosphere",
          spatial_relation: "model_at_point",
          distance_m: 0,
          source: { producer: "Meteo-France", dataset: "meteo-v2" },
          time: { observed_at: "2026-08-07T09:50:00.000Z", retrieved_at: "2026-08-07T10:00:00.000Z" },
          status: { availability: "available" },
        },
      ],
    },
    review: { status: "not_started" },
  };
}

test("accepte un manifeste conforme au contrat", () => {
  const valide = valider(manifesteExemplaire());
  assert.ok(valide, JSON.stringify(valider.errors));
});

test("accepte les actifs optionnels d'une scène et reste rétrocompatible sans eux", () => {
  const sansExtension = manifesteExemplaire();
  sansExtension["scene"] = { glb: "/assets/scene.glb", terrain: null, orthophoto: null };
  assert.ok(valider(sansExtension), JSON.stringify(valider.errors));

  const avecExtension = manifesteExemplaire();
  avecExtension["scene"] = {
    glb: "/assets/scene.glb",
    terrain: "/assets/terrain.glb",
    orthophoto: "/assets/ortho.webp",
    metadata: "/assets/scene.json",
    source_points: { glb: "/assets/source-points.glb", metadata: "/assets/source-points.json" },
    orthophoto_calage: { est_m: 0.4, nord_m: -0.2 },
    geology: { texture: "/assets/geology.png", pick: "/assets/geology-pick.png", metadata: "/assets/geology.json" },
    terrain_bbox: [754601.0, 6329635.0, 754831.0, 6329865.0],
    orthophoto_size_px: 2048,
    orthophoto_resolution_m: 0.1123046875,
  };
  assert.ok(valider(avecExtension), JSON.stringify(valider.errors));
});

test("rejette une carte géologique mal formée", () => {
  const manifeste = manifesteExemplaire();
  manifeste["scene"] = {
    glb: "/assets/scene.glb",
    terrain: null,
    orthophoto: null,
    geology: { texture: "/assets/geology.png" },
  };
  assert.equal(valider(manifeste), false);
});

test("rejette une emprise de terrain qui n'a pas quatre coordonnées", () => {
  const manifeste = manifesteExemplaire();
  manifeste["scene"] = {
    glb: "/assets/scene.glb",
    terrain: null,
    orthophoto: null,
    terrain_bbox: [754601.0, 6329635.0, 754831.0],
  };
  assert.equal(valider(manifeste), false);
});

test("rejette un nuage source mal formé", () => {
  const manifeste = manifesteExemplaire();
  manifeste["scene"] = {
    glb: "/assets/scene.glb",
    terrain: null,
    orthophoto: null,
    source_points: { metadata: null },
  };
  assert.equal(valider(manifeste), false);
});

test("rejette un tile_id mal formé", () => {
  const manifeste = manifesteExemplaire();
  (manifeste["identity"] as Record<string, unknown>)["tile_id"] = "maison-200m";
  assert.equal(valider(manifeste), false);
});

test("rejette une donnée sans provenance", () => {
  const manifeste = manifesteExemplaire();
  const donnee = (manifeste["data"] as Record<string, unknown[]>)["atmosphere"]![0] as Record<string, unknown>;
  delete donnee["source"];
  assert.equal(valider(manifeste), false);
});

test("rejette une largeur différente de 200 m", () => {
  const manifeste = manifesteExemplaire();
  (manifeste["identity"] as Record<string, unknown>)["width_m"] = 100;
  assert.equal(valider(manifeste), false);
});

test("rejette une sphère absente de la taxonomie à six dimensions", () => {
  const manifeste = manifesteExemplaire();
  (manifeste["data"] as Record<string, unknown>)["nearby"] = [];
  assert.equal(valider(manifeste), false);
});
