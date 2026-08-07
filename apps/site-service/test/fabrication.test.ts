import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DonneeDalle, SceneDalle } from "@opendata-vda/shared/dalle";
import { createInstance } from "../src/instances.js";
import { lancerFabrication } from "../src/fabrication.js";
import type { ClientGeographie } from "../src/adapters/geography.js";
import type { ClientScene } from "../src/adapters/scene.js";
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

const SCENE_DEMO: SceneDalle = { glb: "/valleraugue-3d/assets/scenes/maison-200m/scene.glb", terrain: null, orthophoto: null };

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

function clientSceneFixe(scene: SceneDalle | null): ClientScene {
  return { rattacher: async () => scene };
}

function clientSceneEnPanne(): ClientScene {
  return {
    rattacher: async () => {
      throw new Error("scène inaccessible");
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
      scene: clientSceneFixe(SCENE_DEMO),
    });

    assert.equal(manifeste.status, "generated");
    assert.deepEqual(manifeste.data.anthroposphere, [DONNEE_COMMUNE]);
    assert.deepEqual(manifeste.scene, SCENE_DEMO);
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

    const manifeste = await lancerFabrication(pool, racine, tileId, {
      geographie: clientGeographieEnPanne(),
      scene: clientSceneFixe(null),
    });

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

test("n'attache aucune scène quand l'adaptateur n'en renvoie pas", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool } = poolFactice();
    const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
    const tileId = cree.identity.tileId;

    const manifeste = await lancerFabrication(pool, racine, tileId, {
      geographie: clientGeographieFixe([]),
      scene: clientSceneFixe(null),
    });

    assert.equal(manifeste.status, "generated");
    assert.equal(manifeste.scene, undefined);
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});

test("continue jusqu'à generated, sans scène, même si l'adaptateur de scène échoue de façon inattendue", async () => {
  const racine = await dossierTemporaire();
  try {
    const { pool, queries } = poolFactice();
    const cree = await createInstance(pool, racine, { lat: 44.064555, lon: 3.683027 });
    const tileId = cree.identity.tileId;

    const manifeste = await lancerFabrication(pool, racine, tileId, {
      geographie: clientGeographieFixe([]),
      scene: clientSceneEnPanne(),
    });

    assert.equal(manifeste.status, "generated");
    assert.equal(manifeste.scene, undefined);
    assert.ok(
      queries.some(
        (q) => /update sites\.evenements/.test(q.sql) && q.values?.[1] === "echec" && q.values?.[2] === "scène inaccessible",
      ),
      "l'échec de l'adaptateur de scène doit être journalisé",
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
      () =>
        lancerFabrication(pool, racine, "ODV-2026-999999", {
          geographie: clientGeographieFixe([]),
          scene: clientSceneFixe(null),
        }),
      /introuvable/,
    );
  } finally {
    await rm(racine, { recursive: true, force: true });
  }
});
