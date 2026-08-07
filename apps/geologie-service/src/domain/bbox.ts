import { lambert93 } from "@opendata-vda/shared/lambert93";

export interface CentreLambert93 {
  x: number;
  y: number;
}

export interface BboxLambert93 {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export function centreLambert93(longitude: number, latitude: number): CentreLambert93 {
  const [x, y] = lambert93(longitude, latitude);
  return { x, y };
}

export function bboxAutour(centre: CentreLambert93, rayonM: number): BboxLambert93 {
  return {
    xmin: centre.x - rayonM,
    ymin: centre.y - rayonM,
    xmax: centre.x + rayonM,
    ymax: centre.y + rayonM,
  };
}

export function distanceLambert93(centre: CentreLambert93, x: number, y: number): number {
  return Math.hypot(x - centre.x, y - centre.y);
}
