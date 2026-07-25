import test from "node:test";
import assert from "node:assert/strict";
import { bboxWebMercator, lireCoordonneesTuile } from "../src/domain/tuiles.js";

const proche = (a: number, b: number) => Math.abs(a - b) < 0.001;

test("valide les coordonnées slippy", () => {
  assert.deepEqual(lireCoordonneesTuile({ z: "2", x: "1", y: "2" }), { z: 2, x: 1, y: 2 });
  assert.equal(lireCoordonneesTuile({ z: "2", x: "4", y: "0" }), null);
  assert.equal(lireCoordonneesTuile({ z: "x", x: "0", y: "0" }), null);
});

test("calcule la bbox EPSG:3857 de la tuile monde", () => {
  const [minX, minY, maxX, maxY] = bboxWebMercator({ z: 0, x: 0, y: 0 });
  assert.ok(proche(minX, -20037508.342789244));
  assert.ok(proche(minY, -20037508.342789244));
  assert.ok(proche(maxX, 20037508.342789244));
  assert.ok(proche(maxY, 20037508.342789244));
});
