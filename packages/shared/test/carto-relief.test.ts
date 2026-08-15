import test from "node:test";
import assert from "node:assert/strict";
import { bboxAutourPoint, REGIONS_RELIEF, RELIEF_BOUNDS_GLOBAL } from "../src/carto.js";

test("bboxAutourPoint produit un carré centré sur le point, resserré en longitude avec la latitude", () => {
  const [lonMin, latMin, lonMax, latMax] = bboxAutourPoint(0, 0, 111.32);
  assert.ok(Math.abs(lonMin - -1) < 1e-6);
  assert.ok(Math.abs(lonMax - 1) < 1e-6);
  assert.ok(Math.abs(latMin - -1) < 1e-6);
  assert.ok(Math.abs(latMax - 1) < 1e-6);

  // À 60°N, cos(60°) = 0.5 : la demi-largeur en longitude double par rapport à l'équateur.
  const [lonMin60, , lonMax60] = bboxAutourPoint(60, 0, 111.32);
  assert.ok(Math.abs(lonMax60 - lonMin60 - 4) < 1e-6);
});

test("les trois régions de relief ont des bounds distinctes et cohérentes avec leur ville", () => {
  const ids = REGIONS_RELIEF.map((region) => region.id);
  assert.deepEqual(ids, ["aigoual", "alpes-marseille", "perigueux"]);

  const marseille = REGIONS_RELIEF.find((region) => region.id === "alpes-marseille")!;
  assert.ok(marseille.bounds[0] < 5.3698 && marseille.bounds[2] > 5.3698, "Marseille doit être dans sa propre bbox");
  assert.ok(marseille.bounds[1] < 43.2965 && marseille.bounds[3] > 43.2965);

  const perigueux = REGIONS_RELIEF.find((region) => region.id === "perigueux")!;
  assert.ok(perigueux.bounds[0] < 0.7211 && perigueux.bounds[2] > 0.7211, "Périgueux doit être dans sa propre bbox");
  assert.ok(perigueux.bounds[1] < 45.1848 && perigueux.bounds[3] > 45.1848);

  // Les deux régions ajoutées, à ~150-250 km de l'Aigoual, ne se recouvrent pas avec elle
  // (intersection de rectangles : disjointes dès qu'un axe, ici la longitude, ne se chevauche pas).
  const aigoual = REGIONS_RELIEF.find((region) => region.id === "aigoual")!;
  const disjointes = (a: typeof aigoual.bounds, b: typeof aigoual.bounds): boolean =>
    a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];
  assert.ok(disjointes(aigoual.bounds, marseille.bounds), "Marseille ne doit pas chevaucher l’Aigoual");
  assert.ok(disjointes(aigoual.bounds, perigueux.bounds), "Périgueux ne doit pas chevaucher l’Aigoual");
});

test("RELIEF_BOUNDS_GLOBAL englobe les trois régions", () => {
  for (const region of REGIONS_RELIEF) {
    assert.ok(RELIEF_BOUNDS_GLOBAL[0] <= region.bounds[0]);
    assert.ok(RELIEF_BOUNDS_GLOBAL[1] <= region.bounds[1]);
    assert.ok(RELIEF_BOUNDS_GLOBAL[2] >= region.bounds[2]);
    assert.ok(RELIEF_BOUNDS_GLOBAL[3] >= region.bounds[3]);
  }
});
