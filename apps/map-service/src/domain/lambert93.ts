import { ALTIMETRIE_IGN } from "@opendata-vda/shared/carto";
import { bboxWebMercator, latWebMercator, lonWebMercator, type CoordonneesTuile } from "./tuiles.js";

/**
 * Projection conique conforme de Lambert (Lambert-93, RGF93 sur l'ellipsoïde GRS80).
 *
 * Le RGE ALTI n'est servi à son pas natif que dans son propre système : demandé en Web
 * Mercator, il ressort d'une pyramide quatre fois plus grossière, sur-échantillonnée au
 * plus proche voisin. Aller le chercher en Lambert suppose donc de savoir y projeter
 * l'emprise d'une tuile, puis d'y ramener chacun de ses pixels.
 *
 * La projection est séparable : le rayon polaire ne dépend que de la latitude, l'angle que
 * de la longitude. Une tuile de 512 px se reprojette ainsi avec 2 × 512 transcendantes au
 * lieu de 512², soit un coût négligeable devant l'appel réseau — d'où les trois fonctions
 * exposées plutôt qu'un unique `lambert93(lon, lat)`.
 *
 * Formules de Snyder, *Map Projections — A Working Manual*, § conique conforme de Lambert
 * à deux parallèles.
 */

function rad(degres: number): number {
  return (degres * Math.PI) / 180;
}

const DEMI_GRAND_AXE = 6_378_137;
const EXCENTRICITE = 0.081_819_191_042_816;
const LATITUDE_ORIGINE = rad(46.5);
const LONGITUDE_ORIGINE = rad(3);
const PARALLELE_SUD = rad(44);
const PARALLELE_NORD = rad(49);
const FAUX_EST = 700_000;
const FAUX_NORD = 6_600_000;

/** `t(φ)` de Snyder : tangente de la demi-colatitude, corrigée de l'aplatissement. */
function t(phi: number): number {
  const s = EXCENTRICITE * Math.sin(phi);
  return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - s) / (1 + s), EXCENTRICITE / 2);
}

/** `m(φ)` de Snyder : rayon du parallèle, rapporté au demi-grand axe. */
function m(phi: number): number {
  return Math.cos(phi) / Math.sqrt(1 - (EXCENTRICITE * Math.sin(phi)) ** 2);
}

const CONE = (Math.log(m(PARALLELE_SUD)) - Math.log(m(PARALLELE_NORD))) / (Math.log(t(PARALLELE_SUD)) - Math.log(t(PARALLELE_NORD)));
const FACTEUR = m(PARALLELE_SUD) / (CONE * Math.pow(t(PARALLELE_SUD), CONE));
const RAYON_ORIGINE = DEMI_GRAND_AXE * FACTEUR * Math.pow(t(LATITUDE_ORIGINE), CONE);

/** Rayon polaire du point projeté, fonction de la seule latitude (en degrés). */
export function rayonLambert93(latitude: number): number {
  return DEMI_GRAND_AXE * FACTEUR * Math.pow(t(rad(latitude)), CONE);
}

/** Angle polaire du point projeté, fonction de la seule longitude (en degrés). */
export function angleLambert93(longitude: number): number {
  return CONE * (rad(longitude) - LONGITUDE_ORIGINE);
}

/** Recompose les coordonnées Lambert depuis un rayon et un angle déjà calculés. */
export function composerLambert93(rayon: number, sinus: number, cosinus: number): [number, number] {
  return [FAUX_EST + rayon * sinus, FAUX_NORD + RAYON_ORIGINE - rayon * cosinus];
}

export function lambert93(longitude: number, latitude: number): [number, number] {
  const angle = angleLambert93(longitude);
  return composerLambert93(rayonLambert93(latitude), Math.sin(angle), Math.cos(angle));
}

/** Grille Lambert à demander à l'amont pour couvrir une tuile mercator. */
export interface EmpriseLambert {
  /** Coins sud-ouest et nord-est, en mètres Lambert, calés sur la grille de `pas`. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Dimensions de la grille, en échantillons. */
  largeur: number;
  hauteur: number;
  /** Pas de la grille, en mètres. */
  pas: number;
}

/** Échantillons de garde ajoutés autour de la tuile, pour que l'interpolation ait ses voisins. */
const MARGE = 2;

/** Points sondés le long de chaque bord de la tuile pour en encadrer l'image Lambert. */
const SONDES = 4;

/**
 * Emprise Lambert couvrant une tuile Web Mercator.
 *
 * L'image d'une tuile mercator n'est pas un rectangle en Lambert : la convergence des
 * méridiens la fait pivoter de près d'un degré sur le territoire, et ses bords s'incurvent
 * légèrement. On encadre donc une grille de sondes plutôt que les seuls coins.
 *
 * L'emprise est ensuite calée sur une grille métrique globale : sans ce calage, deux tuiles
 * voisines interpoleraient le même relief sur des phases différentes et une couture
 * apparaîtrait à leur jonction, que l'ombrage rendrait bien visible. Le pas double tant que
 * la grille dépasse `tailleMax`, ce qui borne le poids de la réponse amont.
 */
export function empriseLambert(tuile: CoordonneesTuile, tailleMax = ALTIMETRIE_IGN.taille): EmpriseLambert {
  const [minMercX, minMercY, maxMercX, maxMercY] = bboxWebMercator(tuile);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= SONDES; i++) {
    const rayon = rayonLambert93(latWebMercator(minMercY + ((maxMercY - minMercY) * i) / SONDES));
    for (let j = 0; j <= SONDES; j++) {
      const angle = angleLambert93(lonWebMercator(minMercX + ((maxMercX - minMercX) * j) / SONDES));
      const [x, y] = composerLambert93(rayon, Math.sin(angle), Math.cos(angle));
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  let pas = ALTIMETRIE_IGN.resolutionM;
  const echantillons = (etendue: number): number => Math.ceil(etendue / pas) + 2 * MARGE;
  while (echantillons(maxX - minX) > tailleMax || echantillons(maxY - minY) > tailleMax) pas *= 2;

  const plancher = (valeur: number): number => (Math.floor(valeur / pas) - MARGE) * pas;
  const plafond = (valeur: number): number => (Math.ceil(valeur / pas) + MARGE) * pas;
  const x0 = plancher(minX);
  const y0 = plancher(minY);
  const x1 = plafond(maxX);
  const y1 = plafond(maxY);
  return {
    minX: x0,
    minY: y0,
    maxX: x1,
    maxY: y1,
    largeur: Math.round((x1 - x0) / pas),
    hauteur: Math.round((y1 - y0) / pas),
    pas,
  };
}
