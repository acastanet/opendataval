import test from "node:test";
import assert from "node:assert/strict";
import { ALTIMETRIE_IGN } from "@opendata-vda/shared/carto";
import { empriseLambert, lambert93 } from "../src/domain/lambert93.js";
import { bboxWebMercator, latWebMercator, lonWebMercator } from "../src/domain/tuiles.js";

/** Tuile z16 couvrant Valleraugue. */
const TUILE = { z: 16, x: 33441, y: 23850 };

test("place l’origine de Lambert-93 sur son faux origine", () => {
  // La définition d'EPSG:2154 fixe (3° E, 46,5° N) à (700 000, 6 600 000).
  const [x, y] = lambert93(3, 46.5);
  assert.ok(Math.abs(x - 700_000) < 1e-6, `x = ${x}`);
  assert.ok(Math.abs(y - 6_600_000) < 1e-6, `y = ${y}`);
});

test("conserve les angles et l’échelle sur le parallèle d’origine", () => {
  // Une conique conforme ne déforme pas localement : les dérivées partielles en longitude
  // et en latitude restent orthogonales, et l'échelle vaut exactement 1 sur les parallèles
  // d'origine. Un paramètre de cône ou d'excentricité faux romprait l'une ou l'autre.
  const h = 1e-4;
  for (const [lon, lat] of [[3, 44], [4, 49]] as const) {
    const derivee = (a: [number, number], b: [number, number]) => [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
    const dLon = derivee(lambert93(lon + h, lat), lambert93(lon - h, lat));
    const dLat = derivee(lambert93(lon, lat + h), lambert93(lon, lat - h));
    const produit = dLon[0]! * dLat[0]! + dLon[1]! * dLat[1]!;
    const norme = (v: number[]) => Math.hypot(v[0]!, v[1]!);
    assert.ok(Math.abs(produit) / (norme(dLon) * norme(dLat)) < 1e-7, `orthogonalité en ${lat}°`);

    // Rayon vrai du parallèle sur l'ellipsoïde GRS80, en mètres par degré de longitude.
    const e2 = 0.006_694_380_022_9;
    const phi = (lat * Math.PI) / 180;
    const rayonVrai = ((6_378_137 * Math.cos(phi)) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)) * (Math.PI / 180);
    assert.ok(Math.abs(norme(dLon) / rayonVrai - 1) < 1e-7, `échelle en ${lat}° : ${norme(dLon) / rayonVrai}`);
  }
});

test("encadre toute la tuile mercator dans l’emprise Lambert", () => {
  const emprise = empriseLambert(TUILE);
  const [minMercX, minMercY, maxMercX, maxMercY] = bboxWebMercator(TUILE);
  for (const mercX of [minMercX, (minMercX + maxMercX) / 2, maxMercX]) {
    for (const mercY of [minMercY, (minMercY + maxMercY) / 2, maxMercY]) {
      const [x, y] = lambert93(lonWebMercator(mercX), latWebMercator(mercY));
      assert.ok(x > emprise.minX && x < emprise.maxX, `abscisse ${x} hors emprise`);
      assert.ok(y > emprise.minY && y < emprise.maxY, `ordonnée ${y} hors emprise`);
    }
  }
});

test("demande le pas natif du RGE ALTI aux zooms haute définition", () => {
  for (let z = ALTIMETRIE_IGN.zoomMin; z <= ALTIMETRIE_IGN.zoomMax; z++) {
    const emprise = empriseLambert({ z, x: TUILE.x >> (TUILE.z - z), y: TUILE.y >> (TUILE.z - z) });
    assert.equal(emprise.pas, ALTIMETRIE_IGN.resolutionM, `pas en z${z}`);
    assert.ok(emprise.largeur <= ALTIMETRIE_IGN.taille && emprise.hauteur <= ALTIMETRIE_IGN.taille, `taille en z${z}`);
  }
});

test("double le pas plutôt que de dépasser la grille demandée", () => {
  // Une tuile trop large pour tenir au pas natif fait grossir la maille, jamais la réponse.
  const emprise = empriseLambert({ z: 12, x: TUILE.x >> 4, y: TUILE.y >> 4 });
  assert.ok(emprise.pas > ALTIMETRIE_IGN.resolutionM);
  assert.equal(Math.log2(emprise.pas) % 1, 0, "le pas reste une puissance de deux du pas natif");
  assert.ok(emprise.largeur <= ALTIMETRIE_IGN.taille && emprise.hauteur <= ALTIMETRIE_IGN.taille);
});

test("cale les tuiles voisines sur la même grille métrique", () => {
  // Sans ce calage, deux tuiles interpoleraient le même relief sur des phases différentes
  // et l'ombrage soulignerait la couture à leur jonction.
  const gauche = empriseLambert(TUILE);
  const droite = empriseLambert({ ...TUILE, x: TUILE.x + 1 });
  const dessous = empriseLambert({ ...TUILE, y: TUILE.y + 1 });
  for (const voisine of [droite, dessous]) {
    assert.equal(voisine.pas, gauche.pas);
    assert.equal(Math.abs((voisine.minX - gauche.minX) % gauche.pas), 0);
    assert.equal(Math.abs((voisine.minY - gauche.minY) % gauche.pas), 0);
  }
});
