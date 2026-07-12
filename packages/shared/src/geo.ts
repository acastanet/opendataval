/**
 * Certaines API publiques (constaté sur Hub'Eau) inversent occasionnellement lon/lat
 * pour une station isolée. On corrige si l'inversion retombe dans la zone attendue,
 * sinon on rejette le point plutôt que de l'ingérer avec une géométrie fausse.
 */
export function corrigerCoordonnees(
  lon: number,
  lat: number,
  bbox: readonly [number, number, number, number],
  marge = 1,
): [number, number] | null {
  const [west, south, east, north] = bbox;
  const dansZone = (x: number, y: number): boolean =>
    x >= west - marge && x <= east + marge && y >= south - marge && y <= north + marge;

  if (dansZone(lon, lat)) return [lon, lat];
  if (dansZone(lat, lon)) return [lat, lon];
  return null;
}
