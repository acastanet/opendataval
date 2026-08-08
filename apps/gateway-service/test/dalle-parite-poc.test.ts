import assert from "node:assert/strict";
import test from "node:test";
import { entreeDepuisManifeste } from "../public/dalle/manifeste-vers-entree.js";
import { manifesteApercu } from "../src/pages/dalle/fixtures.js";

/**
 * Garde-fou contre la régression visuelle POC → MVP (priorité affichée : « aucune régression
 * entre le POC 3D et le MVP, effet maximum pour le LiDAR HD »). L'entrée de référence est
 * recopiée telle quelle depuis `poc/valleraugue-mairie-3d/publication/assets/scenes.json`
 * (entrée `maison-200m`) plutôt que lue au réseau — un test qui dépend d'un fichier externe
 * pourrait passer alors que ce fichier a changé sous ses pieds. Tout champ que le POC fournit
 * et que `entreeDepuisManifeste` omet doit faire échouer ce test.
 */
const CONFIGURATION_POC_MAISON_200M = {
  terrainBbox: [754601.0, 6329635.0, 754831.0, 6329865.0],
  orthophotoLayer: "ORTHOIMAGERY.ORTHOPHOTOS",
  orthophotoSizePx: 2048,
  orthophotoResolutionM: 0.1123046875,
  centreWgs84: [44.064623, 3.682975],
  geology: {
    texture: "assets/scenes/maison-200m/geology.png",
    pick: "assets/scenes/maison-200m/geology-pick.png",
    metadata: "assets/scenes/maison-200m/geology.json",
  },
};

test("transmet au moteur tout ce que le POC fournissait pour maison-200m", () => {
  const entry = entreeDepuisManifeste(manifesteApercu());
  const configuration = entry.configuration;

  assert.deepEqual(configuration.terrainBbox, CONFIGURATION_POC_MAISON_200M.terrainBbox);
  assert.equal(configuration.orthophotoLayer, CONFIGURATION_POC_MAISON_200M.orthophotoLayer);
  assert.equal(configuration.orthophotoSizePx, CONFIGURATION_POC_MAISON_200M.orthophotoSizePx);
  assert.equal(configuration.orthophotoResolutionM, CONFIGURATION_POC_MAISON_200M.orthophotoResolutionM);
  assert.deepEqual(configuration.centreWgs84, CONFIGURATION_POC_MAISON_200M.centreWgs84);

  const geology = configuration.geology;
  assert.ok(geology, "la carte géologique doit être transmise au moteur");
  for (const champ of ["texture", "pick", "metadata"] as const) {
    assert.ok(
      geology[champ].endsWith(CONFIGURATION_POC_MAISON_200M.geology[champ]),
      `${champ} : ${geology[champ]} ne pointe pas vers l'actif du POC`,
    );
  }
});

test("transmet le nuage LiDAR HD source, pas seulement le maillage reconstruit", () => {
  const entry = entreeDepuisManifeste(manifesteApercu());
  assert.ok(entry.sourcePoints, "sourcePoints doit être transmis au moteur");
  assert.ok(entry.sourcePointsMetadata, "sourcePointsMetadata doit être transmis au moteur");
  assert.match(entry.sourcePoints, /source-points\.glb$/);
});

test("le sur-titre mentionne la provenance IGN LiDAR HD quand le nuage source est rattaché", () => {
  const entry = entreeDepuisManifeste(manifesteApercu());
  assert.match(entry.subtitle, /IGN LiDAR HD/);
});

test("ne dérive jamais terrainBbox de la géométrie de la dalle : absent si la scène ne le porte pas", () => {
  const sansTerrainBbox = manifesteApercu({
    scene: { glb: "/valleraugue-3d/assets/scenes/maison-200m/scene.glb", terrain: null, orthophoto: null },
  });
  const entry = entreeDepuisManifeste(sansTerrainBbox);
  assert.equal(entry.configuration.terrainBbox, null);
});
