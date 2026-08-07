import { lambert93, wgs84DepuisLambert93 } from "./lambert93.js";
import type { CentreDalle, PolygoneGeoJSON } from "./dalle.js";

/** Côté fixe de la dalle MVP, en mètres — voir ADR-004 dans `agent/mvp/09-DECISIONS.md`. */
export const COTE_DALLE_M = 200;

export interface EmpriseDalle {
  center: CentreDalle;
  widthM: 200;
  heightM: 200;
  areaM2: number;
  geometryProjected: PolygoneGeoJSON;
  geometryWgs84: PolygoneGeoJSON;
}

/**
 * Calcule l'emprise carrée d'une dalle centrée sur des coordonnées WGS84.
 *
 * Le carré est défini en coordonnées Lambert-93 (`02-TILE-CONTRACT.md`) : le centre y est
 * projeté, le côté appliqué en mètres, puis chaque coin est reprojeté individuellement en
 * WGS84 par `wgs84DepuisLambert93`, sans jamais passer par une approximation en degrés.
 */
export function empriseDalle(lat: number, lon: number): EmpriseDalle {
  const [centreX, centreY] = lambert93(lon, lat);
  const demiCote = COTE_DALLE_M / 2;

  const coinsProjetes: Array<[number, number]> = [
    [centreX - demiCote, centreY - demiCote],
    [centreX + demiCote, centreY - demiCote],
    [centreX + demiCote, centreY + demiCote],
    [centreX - demiCote, centreY + demiCote],
  ];
  const anneauProjete: [number, number][] = [...coinsProjetes, coinsProjetes[0]!];

  const anneauWgs84: [number, number][] = anneauProjete.map(([x, y]) => wgs84DepuisLambert93(x, y));

  return {
    center: { lat, lon },
    widthM: 200,
    heightM: 200,
    areaM2: COTE_DALLE_M * COTE_DALLE_M,
    geometryProjected: { type: "Polygon", coordinates: [anneauProjete] },
    geometryWgs84: { type: "Polygon", coordinates: [anneauWgs84] },
  };
}
