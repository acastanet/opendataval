import { ALTIMETRIE_IGN } from "@opendata-vda/shared/carto";
import { angleLambert93, composerLambert93, rayonLambert93, lambert93 } from "@opendata-vda/shared/lambert93";
import { bboxWebMercator, latWebMercator, lonWebMercator, type CoordonneesTuile } from "./tuiles.js";

/**
 * Le RGE ALTI n'est servi à son pas natif que dans son propre système : demandé en Web
 * Mercator, il ressort d'une pyramide quatre fois plus grossière, sur-échantillonnée au
 * plus proche voisin. Aller le chercher en Lambert suppose donc de savoir y projeter
 * l'emprise d'une tuile, puis d'y ramener chacun de ses pixels.
 *
 * La projection elle-même (formules de Snyder) vit dans `@opendata-vda/shared/lambert93`,
 * partagée avec le service géologie qui en a besoin pour interroger le BRGM en Lambert-93.
 */
export { angleLambert93, composerLambert93, rayonLambert93, lambert93 };

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
