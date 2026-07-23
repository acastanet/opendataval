import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { Metrics } from "../src/metrics.js";
import { MeteoFranceClient } from "../src/source-client.js";
import { parseMapProduct } from "../src/domain.js";

const enabled = process.env.SMOKE_TEST_METEOFRANCE === "true";

test("fumée facultative de l'API officielle Météo-France", { skip: !enabled }, async () => {
  const config = loadConfig();
  assert.ok(config.apiToken, "METEOFRANCE_VIGILANCE_API_TOKEN est requis pour le smoke test");
  const products = await new MeteoFranceClient(config, new Metrics()).fetchProducts();
  const parsed = parseMapProduct(products.map);
  assert.ok(parsed.departments["30"], "Le Gard doit être présent dans le produit carte");
});
