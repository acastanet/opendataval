import test from "node:test";
import assert from "node:assert/strict";
import { REGIONS_RELIEF } from "@opendata-vda/shared/carto";
import { compterTuiles, lireOptions, tuilesDansBbox } from "../scripts/generer-region-relief.js";

test("tuilesDansBbox couvre toute la grille au zoom 0", () => {
  assert.deepEqual(tuilesDansBbox([3.2, 43.8, 4.1, 44.4], 0), { xMin: 0, xMax: 0, yMin: 0, yMax: 0 });
});

test("tuilesDansBbox reste dans les bornes de la grille au zoom demandé", () => {
  const { xMin, xMax, yMin, yMax } = tuilesDansBbox([3.2, 43.8, 4.1, 44.4], 9);
  const limite = 2 ** 9;
  assert.ok(xMin >= 0 && xMax < limite);
  assert.ok(yMin >= 0 && yMax < limite);
  assert.ok(xMin <= xMax);
  assert.ok(yMin <= yMax);
});

test("compterTuiles cumule les tuiles de chaque zoom de 0 à zoomMax", () => {
  const bounds = [3.2, 43.8, 4.1, 44.4] as const;
  let attendu = 0;
  for (let z = 0; z <= 6; z++) {
    const { xMin, xMax, yMin, yMax } = tuilesDansBbox(bounds, z);
    attendu += (xMax - xMin + 1) * (yMax - yMin + 1);
  }
  assert.equal(compterTuiles(bounds, 6), attendu);
});

test("lireOptions reprend la bbox de REGIONS_RELIEF quand --lat/--lon sont omis", () => {
  const options = lireOptions(["--id", "alpes-marseille", "--sortie", "/tmp/sortie"]);
  const region = REGIONS_RELIEF.find((r) => r.id === "alpes-marseille")!;
  assert.deepEqual(options.bounds, region.bounds);
  assert.equal(options.zoomMax, 15);
});

test("lireOptions calcule la bbox depuis --lat/--lon/--rayon-km pour une région inconnue", () => {
  const options = lireOptions(["--id", "nouvelle-zone", "--lat", "45.75", "--lon", "4.85", "--rayon-km", "50", "--sortie", "/tmp/sortie"]);
  assert.equal(options.id, "nouvelle-zone");
  assert.ok(options.bounds[0] < 4.85 && options.bounds[2] > 4.85);
  assert.ok(options.bounds[1] < 45.75 && options.bounds[3] > 45.75);
});

test("lireOptions exige --sortie", () => {
  assert.throws(() => lireOptions(["--id", "aigoual"]), /--sortie/);
});

test("lireOptions refuse une région inconnue sans --lat/--lon", () => {
  assert.throws(() => lireOptions(["--id", "inconnue", "--sortie", "/tmp/sortie"]), /inconnue/);
});
