import test from "node:test";
import assert from "node:assert/strict";
import { indexLegendes, trouverLegende } from "../src/domain/legendes.js";

test("indexe les couches et les deux légendes transverses", () => {
  const index = indexLegendes();
  assert.ok(index.length >= 17);
  assert.ok(index.some((item) => item.id === "relief-hypsometrique"));
  assert.ok(index.some((item) => item.id === "vigilance-feu"));
});

test("renvoie une légende strictement visuelle", () => {
  const legende = trouverLegende("piezo");
  assert.ok(legende);
  assert.equal(legende?.type, "couche");
  assert.ok(!("source" in (legende ?? {})));
  assert.ok(!("endpoint" in (legende ?? {})));
});

test("renvoie null pour une légende inconnue", () => {
  assert.equal(trouverLegende("inconnue"), null);
});
