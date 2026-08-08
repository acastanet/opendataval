import assert from "node:assert/strict";
import test from "node:test";
import {
  donneesGeneriques,
  modulesConcernant,
  SPHERES_DALLE,
  spheresOrdonnees,
  type ModuleDalle,
} from "../public/dalle/modules/index.js";

const donneeInconnue = { key: "indice_nouveau", value: [1, 2, 3], source: { producer: "test", dataset: "nouveau" } };
const manifeste = { data: { atmosphere: [donneeInconnue] } };

test("un module non concerné reste entièrement inactif", () => {
  let panneauAppele = false;
  let coucheAppelee = false;
  let provenanceAppelee = false;
  const module: ModuleDalle = {
    id: "inactif",
    sphere: "atmosphere",
    concerne: () => false,
    panneau: () => { panneauAppele = true; },
    couche: () => { coucheAppelee = true; },
    provenance: () => { provenanceAppelee = true; return []; },
  };
  const actifs = modulesConcernant(manifeste, [module]);
  for (const actif of actifs) {
    actif.panneau?.(manifeste, {});
    actif.couche?.({}, manifeste, {});
    actif.provenance?.(manifeste);
  }
  assert.deepEqual(actifs, []);
  assert.equal(panneauAppele, false);
  assert.equal(coucheAppelee, false);
  assert.equal(provenanceAppelee, false);
});

test("une donnée non revendiquée tombe dans le relevé générique", () => {
  const module: ModuleDalle = {
    id: "autre",
    sphere: "atmosphere",
    concerne: () => true,
    reclame: () => false,
  };
  assert.deepEqual(donneesGeneriques(manifeste, "atmosphere", [module]), [donneeInconnue]);
});

test("l'ordre des sphères reste celui du contrat", () => {
  assert.deepEqual(
    spheresOrdonnees(manifeste, []).map((sphere) => sphere.id),
    SPHERES_DALLE.map((sphere) => sphere.id),
  );
});
