import assert from "node:assert/strict";
import test from "node:test";
import { parseCoordinates } from "../src/domain/coordinates.js";

test("accepte des coordonnées strictes et conserve la précision horizontale", () => {
  assert.deepEqual(parseCoordinates({ lat: "44.081", lon: "3.641", horizontalAccuracyMeters: "12", positionSource: "browser-geolocation" }), { latitude: 44.081, longitude: 3.641, horizontalAccuracyMeters: 12, positionSource: "browser-geolocation" });
});

test("accepte l'absence de précision sans en inventer", () => {
  assert.deepEqual(parseCoordinates({ lat: "48.8566", lon: "2.3522" }), { latitude: 48.8566, longitude: 2.3522, positionSource: "unknown" });
});

test("refuse les entrées non strictes, invalides ou anormalement longues", () => {
  for (const query of [{ lat: "NaN", lon: "3" }, { lat: "91", lon: "3" }, { lat: "44", lon: "Infinity" }, { lat: "44", lon: "3", horizontalAccuracyMeters: "0" }, { lat: "44", lon: "3", horizontalAccuracyMeters: "1000001" }, { lat: "1".repeat(33), lon: "3" }]) assert.equal(parseCoordinates(query), null);
});
