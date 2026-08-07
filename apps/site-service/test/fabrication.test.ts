import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DonneeDalle } from "@opendata-vda/shared/dalle";
import { createInstance } from "../src/instances.js";
import { lancerFabrication } from "../src/fabrication.js";
import type { ClientGeographie } from "../src/adapters/geography.js";
import { poolFactice } from "./helpers.js";

async function dossierTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "site-service-test-"));
}

const DONNEE_COMMUNE: DonneeDalle = {
  key: "commune",
  value: "Valleraugue (30570)",
  unit: null,
  sphere: "anthroposphere",
  spatialRelation: "administrative",
  distanceM: null,
  source: { producer: "API Découpage administratif", dataset: "geography/commune", url: null, license: null },
  time: { observedAt: "2026-08-07T10:00:00.000Z", retrievedAt: "2026-08-07T10:00:00.000Z", referencePeriod: null },
  status: { availability: "available", freshness: null, review: null },
};

function clientGeographieFixe(donnees: DonneeDalle[]): ClientGeographie {
  return { resoudre: async () => donnees };
}

function clientGeographieEnPanne(): ClientGeographie {
  return {
    resoudre: async () => {
      throw new Error("ECONNREFUSED");
    },
  };
}

test("enrichit puis fait progresser l'instance jusqu'à generated", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
    const tileId = cree.identity.tileId;

    const manifeste = await lancerFabrication(pool, racine, tileId, {
      geographie: clientGeographieFixe([DONNEE_COMMUNE]),
    });

    assert.equal(manifeste.status, "generated");
    assert.deepEqual(manifeste.data.anthroposphere, [DONNEE_COMMUNE]);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("continue jusqu'à generated même si l'adaptateur géographie échoue de façon inattendue", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool, queries } = poolFactice();
    const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
    const tileId = cree.identity.tileId;

    const manifeste = await lancerFabrication(pool, racine, tileId, { geographie: clientGeographieEnPanne() });

    assert.equal(manifeste.status, "generated");
    assert.deepEqual(manifeste.data, {});
    assert.ok(
      queries.some((q) => /update sites\.evenements/.test(q.sql) && q.values?.[1] === "echec"),
      "l'échec de l'adaptateur doit être journalisé",
    );
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("refuse de fabriquer une instance introuvable", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    await assert.rejects(
      () => lancerFabrication(pool, racine, "ODV-2026-999999", { geographie: clientGeographieFixe([]) }),
      /introuvable/,
    );
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});
