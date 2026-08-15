import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ReliefPmtiles } from "../src/services/relief-pmtiles.js";

/** Bbox d'`alpes-marseille` : `bboxAutourPoint(43.2965, 5.3698, 100)`, cf. REGIONS_RELIEF. */
const BOUNDS_MARSEILLE = [4.1358, 42.3982, 6.6038, 44.1948] as const;

const regions = [
  { id: "aigoual", bounds: [3.2, 43.8, 4.1, 44.4] as const, globalPath: "/tmp/absent-aigoual.pmtiles", hdPath: "/tmp/absent-aigoual-hd.pmtiles" },
  {
    id: "alpes-marseille",
    bounds: BOUNDS_MARSEILLE,
    globalPath: "/tmp/absent-marseille.pmtiles",
    hdPath: "/tmp/absent-marseille-hd.pmtiles",
  },
];

const archiveAigoual = fileURLToPath(new URL("../../web/public/relief/aigoual.pmtiles", import.meta.url));
const archiveAigoualHd = fileURLToPath(new URL("../../web/public/relief/aigoual-hd.pmtiles", import.meta.url));
const archivesPresentes = await Promise.all([archiveAigoual, archiveAigoualHd].map((f) => access(f).then(() => true, () => false)));

test("aucune archive montée : toute tuile est une panne, quelle que soit sa position", async () => {
  // Avant les régions, une seule archive absente faisait déjà échouer toute tuile en 503 —
  // le comportement ne doit pas changer pour un déploiement où rien n'est encore monté.
  // Une tuile dans les bounds déclarées d'aigoual, une dans celles d'alpes-marseille (cf.
  // app.test.ts pour le calcul), et une qui n'est dans aucune des deux (0/0/0) : les trois
  // doivent échouer pareillement, puisqu'aucune archive n'existe pour les servir.
  const relief = new ReliefPmtiles(regions);
  await relief.initialiser();

  await assert.rejects(() => relief.getTile(12, 2089, 1487), /RELIEF_INDISPONIBLE/);
  await assert.rejects(() => relief.getTile(12, 2109, 1500), /RELIEF_INDISPONIBLE/);
  await assert.rejects(() => relief.getTile(0, 0, 0), /RELIEF_INDISPONIBLE/);

  await relief.close();
});

test("sans région configurée, une tuile n’est jamais une panne", async () => {
  const relief = new ReliefPmtiles([]);
  await relief.initialiser();
  assert.equal(await relief.getTile(12, 2089, 1487), undefined);
  await relief.close();
});

test("status() reste « indisponible » tant qu’aucune région n’a ses archives", async () => {
  const relief = new ReliefPmtiles(regions);
  await relief.initialiser();
  assert.equal(relief.status(), "indisponible");
  assert.deepEqual(relief.detailRegions(), { aigoual: "indisponible", "alpes-marseille": "indisponible" });
  await relief.close();
});

test(
  "sert une tuile présente dans une archive montée même hors des bounds de sa région",
  { skip: archivesPresentes.every(Boolean) ? false : "archives de relief absentes du dépôt" },
  async () => {
    // Non-régression : présélectionner la région d'après la position de la tuile perdrait des
    // données réellement présentes, et pouvait renvoyer 503 sur une zone servie par l'Aigoual.
    //
    // Une archive contient toute tuile qui *intersecte* sa zone, or une tuile de bas zoom est
    // bien plus large qu'elle. `7/65/46` a son centre à 4,22° E — hors de la bbox aigoual
    // (max 4,1° E) et à l'intérieur de celle d'alpes-marseille, dont aucune archive n'existe —
    // et pourtant l'archive aigoual la sert. Idem pour `0/0/0`, la tuile du monde entier.
    const relief = new ReliefPmtiles([
      { id: "aigoual", bounds: [3.2, 43.8, 4.1, 44.4], globalPath: archiveAigoual, hdPath: archiveAigoualHd },
      { id: "alpes-marseille", bounds: BOUNDS_MARSEILLE, globalPath: "/tmp/absent-marseille.pmtiles", hdPath: "/tmp/absent-marseille-hd.pmtiles" },
    ]);
    await relief.initialiser();

    for (const [z, x, y] of [[7, 65, 46], [0, 0, 0]] as const) {
      const tuile = await relief.getTile(z, x, y);
      assert.ok(tuile && tuile.byteLength > 0, `la tuile ${z}/${x}/${y} doit être servie par l’archive aigoual`);
    }

    // Franchement au nord de la zone : aucune archive ne la porte, et c'est une absence
    // ordinaire, pas une panne — l'archive aigoual étant montée.
    assert.equal(await relief.getTile(9, 261, 184), undefined);

    // Une région encore à générer ne dégrade pas le service : il sert déjà du relief.
    assert.equal(relief.status(), "disponible");
    assert.deepEqual(relief.detailRegions(), { aigoual: "disponible", "alpes-marseille": "indisponible" });

    await relief.close();
  },
);
