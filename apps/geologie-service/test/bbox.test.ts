import assert from "node:assert/strict";
import test from "node:test";
import { bboxAutour, centreLambert93, distanceLambert93 } from "../src/domain/bbox.js";

/** Point de référence de la mission : Val-d'Aigoual. */
const LAT = 44.06455556;
const LON = 3.68302778;

test("convertit le point de référence WGS84 vers Lambert-93 comme pyproj", () => {
  const centre = centreLambert93(LON, LAT);
  assert.ok(Math.abs(centre.x - 754_720.330836965) < 1, `x = ${centre.x}`);
  assert.ok(Math.abs(centre.y - 6_329_742.589097344) < 1, `y = ${centre.y}`);
});

test("construit une bbox carrée centrée sur le point, de côté 2×rayon", () => {
  const centre = centreLambert93(LON, LAT);
  const bbox = bboxAutour(centre, 5000);
  assert.equal(bbox.xmax - bbox.xmin, 10_000);
  assert.equal(bbox.ymax - bbox.ymin, 10_000);
  assert.equal(bbox.xmin, centre.x - 5000);
  assert.equal(bbox.ymax, centre.y + 5000);
});

test("calcule la distance euclidienne réelle en Lambert-93", () => {
  const centre = { x: 0, y: 0 };
  assert.equal(distanceLambert93(centre, 3, 4), 5);
});

test("la bbox n'est jamais assimilée au cercle : un point dans la bbox peut être hors rayon", () => {
  // Un point au coin de la bbox carrée de rayon 5000 est à ~7071 m du centre (5000·√2).
  const centre = { x: 0, y: 0 };
  const distanceAuCoin = distanceLambert93(centre, 5000, 5000);
  assert.ok(distanceAuCoin > 5000, "le coin de la bbox doit être hors du cercle de rayon 5000");
});
