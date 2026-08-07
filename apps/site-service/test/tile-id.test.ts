import test from "node:test";
import assert from "node:assert/strict";
import { genererTileId } from "../src/tile-id.js";
import { poolFactice } from "./helpers.js";

test("produit un identifiant ODV-YYYY-NNNNNN, compteur remis sur six chiffres", async () => {
  const { pool, queries } = poolFactice();
  const id = await genererTileId(pool);
  const annee = new Date().getUTCFullYear();
  assert.equal(id, `ODV-${annee}-000001`);
  assert.match(queries[0]?.sql ?? "", /nextval\('sites\.tile_id_seq'\)/);
});

test("incrémente à chaque appel, sans jamais réutiliser un compteur", async () => {
  const { pool } = poolFactice();
  const a = await genererTileId(pool);
  const b = await genererTileId(pool);
  assert.notEqual(a, b);
  assert.ok(a < b, "le compteur doit croître, ODV-… restant comparable lexicographiquement à année égale");
});
