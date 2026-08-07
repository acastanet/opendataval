import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { ALTIMETRIE_IGN } from "@opendata-vda/shared/carto";
import { decoderTerrarium, encoderTerrarium, lireBil, reprojeterVersTuile, tuileTerrarium } from "../src/services/relief-ign.js";
import { encoderPng } from "../src/services/png.js";
import { urlAltimetrieIgn } from "../src/clients/amonts.js";
import { empriseLambert, lambert93, type EmpriseLambert } from "../src/domain/lambert93.js";
import { bboxWebMercator, latWebMercator, lonWebMercator } from "../src/domain/tuiles.js";

const TAILLE = ALTIMETRIE_IGN.taille;
/** Tuile z16 couvrant Valleraugue. */
const TUILE = { z: 16, x: 33441, y: 23850 };

/** Grille Lambert de test : l'altitude est une fonction connue des coordonnées projetées. */
function bil(emprise: EmpriseLambert, altitude: (x: number, y: number) => number): Buffer {
  const buffer = Buffer.alloc(emprise.largeur * emprise.hauteur * 4);
  for (let ligne = 0; ligne < emprise.hauteur; ligne++) {
    for (let colonne = 0; colonne < emprise.largeur; colonne++) {
      const x = emprise.minX + (colonne + 0.5) * emprise.pas;
      const y = emprise.maxY - (ligne + 0.5) * emprise.pas;
      buffer.writeFloatLE(altitude(x, y), (ligne * emprise.largeur + colonne) * 4);
    }
  }
  return buffer;
}

/** Relit les pixels d'un PNG produit par `encoderPng` (RGB 8 bits, filtre 0). */
function pixelsPng(png: Buffer, taille: number): Buffer {
  let position = 8;
  const morceaux: Buffer[] = [];
  while (position < png.length) {
    const longueur = png.readUInt32BE(position);
    const type = png.toString("ascii", position + 4, position + 8);
    if (type === "IDAT") morceaux.push(png.subarray(position + 8, position + 8 + longueur));
    position += 12 + longueur;
  }
  const brut = inflateSync(Buffer.concat(morceaux));
  const rgb = Buffer.alloc(taille * taille * 3);
  for (let y = 0; y < taille; y++) {
    assert.equal(brut[y * (1 + taille * 3)], 0, "filtre de ligne inattendu");
    brut.copy(rgb, y * taille * 3, y * (1 + taille * 3) + 1, (y + 1) * (1 + taille * 3));
  }
  return rgb;
}

test("encode et relit une altitude en terrarium", () => {
  for (const altitude of [0, 1, 153.5, 1567.25, -5.75, 2000]) {
    const [r, g, b] = encoderTerrarium(altitude);
    // La convention terrarium résout 1/256 m ; l'aller-retour ne doit rien perdre de plus.
    assert.ok(Math.abs(decoderTerrarium(r, g, b) - altitude) <= 1 / 256, `altitude ${altitude}`);
  }
});

test("produit un PNG relisible depuis une réponse BIL", () => {
  const emprise = empriseLambert(TUILE);
  const png = tuileTerrarium(bil(emprise, () => 617.5), emprise, TUILE);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), TAILLE);
  assert.equal(png.readUInt32BE(20), TAILLE);
  assert.equal(png.toString("ascii", png.length - 8, png.length - 4), "IEND");

  const rgb = pixelsPng(png, TAILLE);
  for (const i of [0, 1, 511, 12345, TAILLE * TAILLE - 1]) {
    assert.ok(Math.abs(decoderTerrarium(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!) - 617.5) <= 1 / 256);
  }
});

test("replace chaque pixel de la tuile à sa position Lambert", () => {
  // Le plan d'altitude est une fonction affine des coordonnées projetées : si la
  // reprojection est juste, chaque pixel retrouve la valeur du point Lambert qui lui
  // correspond, au centième de mètre près. Un décalage ou une inversion d'axe sauterait
  // aux yeux — un mètre d'erreur vaut ici une unité d'altitude.
  const emprise = empriseLambert(TUILE);
  const plan = (x: number, y: number) => (x - emprise.minX) * 0.5 + (y - emprise.minY) * 0.25;
  const altitudes = reprojeterVersTuile(lireBil(bil(emprise, plan), emprise), emprise, TUILE);

  const [minMercX, , maxMercX, maxMercY] = bboxWebMercator(TUILE);
  const pasMerc = (maxMercX - minMercX) / TAILLE;
  for (const [ligne, colonne] of [[0, 0], [0, TAILLE - 1], [TAILLE - 1, 0], [255, 300], [TAILLE - 1, TAILLE - 1]]) {
    const lon = lonWebMercator(minMercX + (colonne! + 0.5) * pasMerc);
    const lat = latWebMercator(maxMercY - (ligne! + 0.5) * pasMerc);
    const [x, y] = lambert93(lon, lat);
    assert.ok(
      Math.abs(altitudes[ligne! * TAILLE + colonne!]! - plan(x, y)) < 0.01,
      `pixel ${ligne},${colonne} : ${altitudes[ligne! * TAILLE + colonne!]} au lieu de ${plan(x, y)}`,
    );
  }
});

test("ramène les pixels hors couverture au niveau de la mer", () => {
  // Encodée telle quelle, la valeur nodata creuserait un gouffre de 100 km dans le terrain.
  const emprise = empriseLambert(TUILE);
  const rgb = pixelsPng(tuileTerrarium(bil(emprise, () => ALTIMETRIE_IGN.nodata), emprise, TUILE), TAILLE);
  assert.equal(decoderTerrarium(rgb[0]!, rgb[1]!, rgb[2]!), 0);
});

test("écarte les échantillons manquants du voisinage plutôt que de les moyenner", () => {
  // Au bord de la couverture, interpoler nodata avec ses voisins valides enfoncerait le
  // relief de plusieurs kilomètres sur toute une frange de la tuile.
  const emprise = empriseLambert(TUILE);
  const milieu = emprise.minY + ((emprise.maxY - emprise.minY) / 2);
  const grille = lireBil(bil(emprise, (_x, y) => (y > milieu ? 800 : ALTIMETRIE_IGN.nodata)), emprise);
  const altitudes = reprojeterVersTuile(grille, emprise, TUILE);
  for (const altitude of altitudes) assert.ok(altitude === 0 || altitude === 800, `altitude intermédiaire ${altitude}`);
});

test("refuse une réponse altimétrique de taille inattendue", () => {
  assert.throws(() => lireBil(Buffer.alloc(1024), empriseLambert(TUILE)), /Réponse altimétrique inattendue/);
});

test("valide le CRC des blocs PNG", () => {
  const png = encoderPng(Buffer.alloc(4 * 4 * 3, 0x7f), 4, 4);
  let position = 8;
  let blocs = 0;
  while (position < png.length) {
    const longueur = png.readUInt32BE(position);
    const corps = png.subarray(position + 4, position + 8 + longueur);
    const attendu = png.readUInt32BE(position + 8 + longueur);
    let c = 0xffffffff;
    for (const octet of corps) {
      c ^= octet;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    assert.equal((c ^ 0xffffffff) >>> 0, attendu, "CRC invalide");
    blocs++;
    position += 12 + longueur;
  }
  assert.equal(blocs, 3);
});

test("interroge le WMS altimétrique en Lambert-93, à l’ordre d’axes de WMS 1.3.0", () => {
  const emprise = empriseLambert(TUILE);
  const url = new URL(urlAltimetrieIgn("https://data.geopf.fr/wms-r/wms", ALTIMETRIE_IGN.couche, emprise));
  // La couche par défaut est la pyramide native. Interrogée à la place, la couche « HIGHRES »
  // plafonne à 4,78 m/px quel que soit le système et pose sur les tuiles un réseau régulier de
  // 3,45 m au sol, que l'ombrage rend en quadrillage.
  assert.equal(url.searchParams.get("LAYERS"), "RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS");
  assert.equal(url.searchParams.get("FORMAT"), ALTIMETRIE_IGN.format);
  // Cette pyramide n'existe qu'en Lambert-93 ; et là où les deux systèmes existent, la pyramide
  // EPSG:3857 duplique les colonnes au plus proche voisin.
  assert.equal(url.searchParams.get("CRS"), "EPSG:2154");
  assert.equal(url.searchParams.get("WIDTH"), String(emprise.largeur));
  assert.equal(url.searchParams.get("HEIGHT"), String(emprise.hauteur));
  const [minX, minY, maxX, maxY] = url.searchParams.get("BBOX")!.split(",").map(Number);
  assert.deepEqual([minX, minY, maxX, maxY], [emprise.minX, emprise.minY, emprise.maxX, emprise.maxY]);
  // EPSG:2154 s'ordonne X,Y : inversé, l'IGN répond 200 avec du nodata.
  assert.ok(minX! < 1_300_000 && minY! > 6_000_000, "l’abscisse Lambert doit précéder l’ordonnée");
});

test("laisse la configuration choisir la couche altimétrique", () => {
  // Le défaut est un nom de pyramide interne à l'IGN : il doit pouvoir être remplacé sans
  // reconstruire l'image, le jour où l'amont le renomme.
  const url = new URL(urlAltimetrieIgn("https://ign.test/wms", "AUTRE.COUCHE", empriseLambert(TUILE)));
  assert.equal(url.searchParams.get("LAYERS"), "AUTRE.COUCHE");
});

test("ne demande jamais l’altimétrie plus fine que son pas natif", () => {
  // Demandée plus fine, la Géoplateforme duplique ou interpole, et le réseau de sa grille
  // ressort sous l'ombrage. C'est le piège qui a produit le quadrillage.
  for (let z = ALTIMETRIE_IGN.zoomMin; z <= ALTIMETRIE_IGN.zoomMax; z++) {
    const emprise = empriseLambert({ z, x: TUILE.x >> (TUILE.z - z), y: TUILE.y >> (TUILE.z - z) });
    assert.ok(emprise.pas >= ALTIMETRIE_IGN.resolutionM, `pas ${emprise.pas} m en z${z}`);
  }
});
