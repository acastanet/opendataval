import { ALTIMETRIE_IGN } from "@opendata-vda/shared/carto";
import { angleLambert93, composerLambert93, rayonLambert93, type EmpriseLambert } from "../domain/lambert93.js";
import { bboxWebMercator, latWebMercator, lonWebMercator, type CoordonneesTuile } from "../domain/tuiles.js";
import { encoderPng } from "./png.js";

/**
 * Conversion du modèle altimétrique de la Géoplateforme (RGE ALTI, servi en BIL 32 bits)
 * vers une tuile terrarium consommable par MapLibre.
 *
 * Le BIL n'a pas d'en-tête : c'est la grille brute des altitudes en float32 little-endian,
 * ligne par ligne, du nord-ouest au sud-est — soit exactement l'ordre des pixels d'une
 * image. La grille est demandée en Lambert-93, seul système où la couche est servie à son
 * pas natif ; il faut donc la ramener à la grille Web Mercator de la tuile avant de
 * ré-encoder chaque altitude sur trois octets.
 */

/** Le WMS renvoie `nodata` (-99999) hors couverture : tout ce qui plonge y est écarté. */
const PLANCHER_VALIDE = ALTIMETRIE_IGN.nodata / 2;

/** `altitude = (R × 256 + G + B / 256) − 32768`, la convention terrarium de Mapzen. */
export function encoderTerrarium(altitude: number): [number, number, number] {
  const v = Math.min(Math.max(altitude, -32768), 32767) + 32768;
  const entier = Math.floor(v);
  return [(entier >> 8) & 0xff, entier & 0xff, Math.floor((v - entier) * 256) & 0xff];
}

export function decoderTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Relit la réponse BIL comme la grille d'altitudes décrite par l'emprise demandée. */
export function lireBil(bil: Buffer, emprise: EmpriseLambert): Float32Array {
  const attendu = emprise.largeur * emprise.hauteur * 4;
  if (bil.length !== attendu) {
    throw new Error(`Réponse altimétrique inattendue : ${bil.length} octets au lieu de ${attendu}.`);
  }
  const grille = new Float32Array(emprise.largeur * emprise.hauteur);
  for (let i = 0; i < grille.length; i++) grille[i] = bil.readFloatLE(i * 4);
  return grille;
}

/**
 * Altitude interpolée en un point Lambert quelconque de la grille.
 *
 * L'interpolation est bilinéaire, mais les échantillons hors couverture sont exclus et les
 * poids renormalisés : les moyenner reviendrait à creuser un gouffre de 100 km au bord de
 * la couverture. Sans aucun voisin valide, on retombe au niveau de la mer.
 */
function echantillonner(grille: Float32Array, emprise: EmpriseLambert, x: number, y: number): number {
  const fx = (x - emprise.minX) / emprise.pas - 0.5;
  const fy = (emprise.maxY - y) / emprise.pas - 0.5;
  const colonne = Math.floor(fx);
  const ligne = Math.floor(fy);
  const tx = fx - colonne;
  const ty = fy - ligne;
  let somme = 0;
  let poids = 0;
  for (let dy = 0; dy <= 1; dy++) {
    const l = Math.min(Math.max(ligne + dy, 0), emprise.hauteur - 1);
    const py = dy === 1 ? ty : 1 - ty;
    for (let dx = 0; dx <= 1; dx++) {
      const c = Math.min(Math.max(colonne + dx, 0), emprise.largeur - 1);
      const altitude = grille[l * emprise.largeur + c]!;
      if (!Number.isFinite(altitude) || altitude <= PLANCHER_VALIDE) continue;
      const p = py * (dx === 1 ? tx : 1 - tx);
      somme += altitude * p;
      poids += p;
    }
  }
  return poids > 0 ? somme / poids : 0;
}

/**
 * Ramène la grille Lambert sur la grille Web Mercator de la tuile.
 *
 * Le rayon polaire ne dépendant que de la latitude et l'angle que de la longitude, les deux
 * sont précalculés par ligne et par colonne : chaque pixel ne coûte alors que deux
 * multiplications, et la reprojection reste négligeable devant l'appel réseau.
 */
export function reprojeterVersTuile(
  grille: Float32Array,
  emprise: EmpriseLambert,
  tuile: CoordonneesTuile,
  taille = ALTIMETRIE_IGN.taille,
): Float32Array {
  const [minMercX, , maxMercX, maxMercY] = bboxWebMercator(tuile);
  const pasMerc = (maxMercX - minMercX) / taille;
  const rayons = new Float64Array(taille);
  const sinus = new Float64Array(taille);
  const cosinus = new Float64Array(taille);
  for (let i = 0; i < taille; i++) {
    rayons[i] = rayonLambert93(latWebMercator(maxMercY - (i + 0.5) * pasMerc));
    const angle = angleLambert93(lonWebMercator(minMercX + (i + 0.5) * pasMerc));
    sinus[i] = Math.sin(angle);
    cosinus[i] = Math.cos(angle);
  }

  const altitudes = new Float32Array(taille * taille);
  for (let ligne = 0; ligne < taille; ligne++) {
    const rayon = rayons[ligne]!;
    for (let colonne = 0; colonne < taille; colonne++) {
      const [x, y] = composerLambert93(rayon, sinus[colonne]!, cosinus[colonne]!);
      altitudes[ligne * taille + colonne] = echantillonner(grille, emprise, x, y);
    }
  }
  return altitudes;
}

/** Encode une grille d'altitudes en PNG terrarium. */
export function terrariumPng(altitudes: Float32Array, taille = ALTIMETRIE_IGN.taille): Buffer {
  const rgb = Buffer.alloc(taille * taille * 3);
  for (let i = 0; i < taille * taille; i++) {
    const [r, g, b] = encoderTerrarium(altitudes[i]!);
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return encoderPng(rgb, taille, taille);
}

/** Chaîne complète : réponse BIL Lambert d'une emprise vers tuile terrarium mercator. */
export function tuileTerrarium(
  bil: Buffer,
  emprise: EmpriseLambert,
  tuile: CoordonneesTuile,
  taille = ALTIMETRIE_IGN.taille,
): Buffer {
  return terrariumPng(reprojeterVersTuile(lireBil(bil, emprise), emprise, tuile, taille), taille);
}
