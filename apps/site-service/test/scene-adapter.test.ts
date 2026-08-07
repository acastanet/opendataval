import test from "node:test";
import assert from "node:assert/strict";
import { creerClientSceneProvisoire } from "../src/adapters/scene.js";

test("rattache la scène configurée, terrain et orthophoto non renseignés séparément", async () => {
  const client = creerClientSceneProvisoire({ glbUrl: "/valleraugue-3d/assets/scenes/maison-200m/scene.glb" });
  const scene = await client.rattacher();
  assert.deepEqual(scene, {
    glb: "/valleraugue-3d/assets/scenes/maison-200m/scene.glb",
    terrain: null,
    orthophoto: null,
  });
});

test("ne rattache aucune scène quand aucune URL n'est configurée", async () => {
  const client = creerClientSceneProvisoire({ glbUrl: null });
  const scene = await client.rattacher();
  assert.equal(scene, null);
});

test("ne rattache aucune scène pour une URL vide", async () => {
  const client = creerClientSceneProvisoire({ glbUrl: "" });
  const scene = await client.rattacher();
  assert.equal(scene, null);
});
