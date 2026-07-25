const ORIGINE_MERCATOR = 20_037_508.342789244;

export interface CoordonneesTuile { z: number; x: number; y: number }

export function lireCoordonneesTuile(params: Record<string, unknown>, maxZoom = 22): CoordonneesTuile | null {
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > maxZoom) return null;
  const limite = 2 ** z;
  if (x < 0 || y < 0 || x >= limite || y >= limite) return null;
  return { z, x, y };
}

export function bboxWebMercator({ z, x, y }: CoordonneesTuile): [number, number, number, number] {
  const taille = (2 * ORIGINE_MERCATOR) / 2 ** z;
  const minX = -ORIGINE_MERCATOR + x * taille;
  const maxX = minX + taille;
  const maxY = ORIGINE_MERCATOR - y * taille;
  const minY = maxY - taille;
  return [minX, minY, maxX, maxY];
}

export function cleTuile(source: string, tuile: CoordonneesTuile, variante = ""): string {
  return `${source}:${tuile.z}:${tuile.x}:${tuile.y}:${variante}`;
}
