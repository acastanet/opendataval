import assert from "node:assert/strict";
import test from "node:test";
import { createBrgmClient } from "../src/clients/brgm.js";
import { loadConfig } from "../src/config.js";
import { bboxAutour, centreLambert93 } from "../src/domain/bbox.js";

/**
 * Test d'intégration réel, jamais exécuté par défaut : il appelle le WFS BRGM en
 * production. Activé explicitement via `GEOLOGIE_TEST_LIVE=true pnpm test:geologie`.
 */
const LIVE = process.env.GEOLOGIE_TEST_LIVE === "true";

test(
  "le WFS BRGM répond réellement sur le cas de référence (Val-d'Aigoual, 5 km)",
  { skip: !LIVE && "GEOLOGIE_TEST_LIVE non défini : test d'intégration BRGM ignoré" },
  async () => {
    const config = loadConfig();
    const brgm = createBrgmClient(config, globalThis.fetch.bind(globalThis));
    const centre = centreLambert93(3.68302778, 44.06455556);
    const bbox = bboxAutour(centre, 5000);

    const resultat = await brgm.featuresDansBbox(bbox);
    assert.ok(resultat.features.length > 0, "le BRGM doit renvoyer des ouvrages autour de Val-d'Aigoual");

    const bssIds = resultat.features.map((f) => f.properties?.bss_id);
    assert.ok(bssIds.includes("BSS002DKFG"), "MONNA doit être présent dans la réponse réelle");
    assert.ok(bssIds.includes("BSS002DKEC"), "VA-2A doit être présent dans la réponse réelle");
  },
);
