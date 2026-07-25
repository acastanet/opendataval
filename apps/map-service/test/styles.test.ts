import test from "node:test";
import assert from "node:assert/strict";
import { construireStyle, lireOptionsStyle } from "../src/domain/styles.js";

const options = lireOptionsStyle({ fond: "plan", terrain: "1", exageration: "1.4", geologie: "1", relief: "1" });

test("construit les quatre styles nommés", () => {
  for (const nom of ["plan", "territoire", "relief", "hypsometrique"] as const) {
    const style = construireStyle(nom, options);
    assert.equal(style.version, 8);
    assert.ok(Array.isArray(style.layers));
  }
});

test("fige les identifiants canoniques du style territoire", () => {
  const style = construireStyle("territoire", options);
  const ids = (style.layers as { id: string }[]).map((layer) => layer.id);
  assert.deepEqual(ids, ["basemap-plan", "basemap-photo", "basemap-satellite", "geologie-layer", "relief-hillshade"]);
});

test("préfixe toutes les sources et couches", () => {
  const style = construireStyle("relief", { ...options, prefixe: "principal" });
  assert.ok(Object.keys(style.sources as object).every((id) => id.startsWith("principal-")));
  assert.ok((style.layers as { id: string }[]).every((layer) => layer.id.startsWith("principal-")));
});

test("refuse un préfixe invalide", () => {
  assert.throws(() => lireOptionsStyle({ prefixe: "../x" }), /préfixe cartographique/);
});
