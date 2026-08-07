/**
 * Projection conique conforme de Lambert (Lambert-93, RGF93 sur l'ellipsoïde GRS80).
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

function deg(radians: number): number {
  return (radians * 180) / Math.PI;
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

/** Nombre d'itérations pour retrouver la latitude géodésique depuis la latitude conforme — Snyder converge bien avant, cette marge reste sans coût mesurable. */
const ITERATIONS_LATITUDE = 8;

/**
 * Projection inverse : retrouve la longitude/latitude WGS84 depuis un point Lambert-93.
 *
 * Sert au contrat de dalle (`agent/mvp/02-TILE-CONTRACT.md`), qui calcule le carré en
 * Lambert-93 puis doit en conserver la version WGS84 sans passer par une approximation en
 * degrés. La longitude se déduit directement de l'angle polaire ; la latitude demande de
 * retrouver la latitude géodésique à partir de la latitude conforme de Snyder, par
 * itération à point fixe (formule 7-9 de *Map Projections — A Working Manual*).
 */
export function wgs84DepuisLambert93(x: number, y: number): [number, number] {
  const dx = x - FAUX_EST;
  const dy = FAUX_NORD + RAYON_ORIGINE - y;
  const rayon = Math.sqrt(dx * dx + dy * dy) * Math.sign(CONE);
  const angle = Math.atan2(dx, dy) / CONE;
  const longitude = LONGITUDE_ORIGINE + angle;

  const tRayon = Math.pow(rayon / (DEMI_GRAND_AXE * FACTEUR), 1 / CONE);
  let phi = Math.PI / 2 - 2 * Math.atan(tRayon);
  for (let i = 0; i < ITERATIONS_LATITUDE; i++) {
    const s = EXCENTRICITE * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(tRayon * Math.pow((1 - s) / (1 + s), EXCENTRICITE / 2));
  }

  return [deg(longitude), deg(phi)];
}
