import test from "node:test";
import assert from "node:assert/strict";
import { CacheTuiles } from "../src/services/cache-tuiles.js";

const entree = (texte: string) => ({ data: Buffer.from(texte), contentType: "image/png", cacheControl: "public" });

test("évince la tuile la moins récemment utilisée", () => {
  const cache = new CacheTuiles(6);
  cache.set("a", entree("aaa"));
  cache.set("b", entree("bbb"));
  assert.ok(cache.get("a"));
  cache.set("c", entree("ccc"));
  assert.equal(cache.get("b"), undefined);
  assert.ok(cache.get("a"));
  assert.ok(cache.get("c"));
});

test("ignore une tuile plus grande que le cache", () => {
  const cache = new CacheTuiles(2);
  cache.set("a", entree("trop-long"));
  assert.equal(cache.stats().entrees, 0);
});
