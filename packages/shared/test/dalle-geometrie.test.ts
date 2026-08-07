import test from "node:test";
import assert from "node:assert/strict";
import { empriseDalle, COTE_DALLE_M } from "../src/dalle-geometrie.js";
import { lambert93, wgs84DepuisLambert93 } from "../src/lambert93.js";

/** Point de référence : la mairie de Valleraugue (cf. `agent/mvp/04-SITE-SERVICE.md`). */
const LAT = 44.064555;
const LON = 3.683027;

/** Test point-dans-polygone par lancer de rayon, sur un anneau GeoJSON `[lon, lat]`. */
function contient(anneau: [number, number][], point: [number, number]): boolean {
  let dedans = false;
  const [px, py] = point;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i]!;
    const [xj, yj] = anneau[j]!;
    const traverse = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (traverse) dedans = !dedans;
  }
  return dedans;
}

test("produit un carré de 200 m de côté et 40 000 m² de surface", () => {
  const emprise = empriseDalle(LAT, LON);
  assert.equal(emprise.widthM, 200);
  assert.equal(emprise.heightM, 200);
  assert.equal(emprise.areaM2, COTE_DALLE_M * COTE_DALLE_M);

  const anneau = emprise.geometryProjected.coordinates[0]!;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = anneau[i]!;
    const [x2, y2] = anneau[i + 1]!;
    const cote = Math.hypot(x2! - x1!, y2! - y1!);
    assert.ok(Math.abs(cote - 200) < 1e-6, `côté ${i} = ${cote} m`);
  }
});

test("reste déterministe pour deux calculs identiques", () => {
  const a = empriseDalle(LAT, LON);
  const b = empriseDalle(LAT, LON);
  assert.deepEqual(a.geometryProjected, b.geometryProjected);
  assert.deepEqual(a.geometryWgs84, b.geometryWgs84);
});

test("contient le centre dans le polygone, en projeté comme en WGS84", () => {
  const emprise = empriseDalle(LAT, LON);
  const [cx, cy] = lambert93(LON, LAT);
  assert.ok(contient(emprise.geometryProjected.coordinates[0]! as [number, number][], [cx, cy]));
  assert.ok(contient(emprise.geometryWgs84.coordinates[0]! as [number, number][], [LON, LAT]));
});

test("fait l'aller-retour WGS84 → Lambert-93 → WGS84 sous tolérance", () => {
  const points: Array<[number, number]> = [
    [3.683027, 44.064555],
    [3, 46.5],
    [-1.5, 48.1],
    [7.2, 43.6],
  ];
  for (const [lon, lat] of points) {
    const [x, y] = lambert93(lon, lat);
    const [lonRetour, latRetour] = wgs84DepuisLambert93(x, y);
    assert.ok(Math.abs(lonRetour - lon) < 1e-7, `longitude ${lonRetour} ≠ ${lon}`);
    assert.ok(Math.abs(latRetour - lat) < 1e-7, `latitude ${latRetour} ≠ ${lat}`);
  }
});
