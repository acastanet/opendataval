import { area } from "@turf/area";
import { buffer } from "@turf/buffer";
import { intersect } from "@turf/intersect";
import { union } from "@turf/union";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";
import type { SurfaceFeature, SurfaceGeometry } from "./types.js";

function ringContains(ring: Position[], lon: number, lat: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const currentX = currentPoint[0];
    const currentY = currentPoint[1];
    const previousX = previousPoint[0];
    const previousY = previousPoint[1];
    if (
      currentX === undefined || currentY === undefined ||
      previousX === undefined || previousY === undefined
    ) continue;
    const crosses = (currentY > lat) !== (previousY > lat)
      && lon < ((previousX - currentX) * (lat - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContains(coordinates: Position[][], lon: number, lat: number): boolean {
  const exterior = coordinates[0];
  if (!exterior || !ringContains(exterior, lon, lat)) return false;
  return !coordinates.slice(1).some((hole) => ringContains(hole, lon, lat));
}

export function surfaceContains(geometry: SurfaceGeometry, lon: number, lat: number): boolean {
  return geometry.type === "Polygon"
    ? polygonContains(geometry.coordinates, lon, lat)
    : geometry.coordinates.some((polygon) => polygonContains(polygon, lon, lat));
}

function stripPosition(position: Position): Position {
  return [Number(position[0]), Number(position[1])];
}

export function normalizeSurface(geometry: Geometry | null): SurfaceGeometry | null {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map(stripPosition)),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map(stripPosition))),
  };
}

function exteriorPositions(geometry: SurfaceGeometry): Position[] {
  return geometry.type === "Polygon"
    ? geometry.coordinates[0] ?? []
    : geometry.coordinates.flatMap((polygon) => polygon[0] ?? []);
}

function haversineMeters(a: Position, b: Position): number {
  const toRadians = Math.PI / 180;
  const lat1 = Number(a[1]) * toRadians;
  const lat2 = Number(b[1]) * toRadians;
  const deltaLat = (Number(b[1]) - Number(a[1])) * toRadians;
  const deltaLon = (Number(b[0]) - Number(a[0])) * toRadians;
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function centroidDistance(geometry: SurfaceGeometry, lon: number, lat: number): number {
  const positions = exteriorPositions(geometry);
  if (!positions.length) return Number.POSITIVE_INFINITY;
  const centroid: Position = [
    positions.reduce((sum, position) => sum + Number(position[0]), 0) / positions.length,
    positions.reduce((sum, position) => sum + Number(position[1]), 0) / positions.length,
  ];
  return haversineMeters([lon, lat], centroid);
}

export function selectBuilding(
  collection: FeatureCollection,
  lon: number,
  lat: number,
  maximumCentroidDistanceMeters: number,
): SurfaceFeature | null {
  const candidates = collection.features.flatMap((feature) => {
    const geometry = normalizeSurface(feature.geometry);
    if (!geometry) return [];
    return [{
      type: "Feature" as const,
      id: feature.id,
      geometry,
      properties: feature.properties ?? {},
    }];
  });
  const containing = candidates
    .filter((feature) => surfaceContains(feature.geometry, lon, lat))
    .sort((a, b) => area(a) - area(b));
  if (containing[0]) return containing[0];
  const nearest = candidates
    .map((feature) => ({ feature, distance: centroidDistance(feature.geometry, lon, lat) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance <= maximumCentroidDistanceMeters ? nearest.feature : null;
}

export function surfaceFeature(
  geometry: SurfaceGeometry,
  properties: GeoJsonProperties = {},
): SurfaceFeature {
  return { type: "Feature", geometry, properties };
}

export function pointFeature(lon: number, lat: number, properties: GeoJsonProperties = {}): Feature<Point> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties,
  };
}

export function bufferSurface(feature: Feature<SurfaceGeometry | Point>, distanceMeters: number): SurfaceFeature {
  const result = buffer(feature, distanceMeters, { units: "meters", steps: 32 });
  const geometry = normalizeSurface(result?.geometry ?? null);
  if (!geometry) throw new Error("Le tampon géographique n’a pas pu être calculé.");
  return surfaceFeature(geometry);
}

export function intersectSurfaces(first: SurfaceFeature, second: SurfaceFeature): SurfaceFeature | null {
  const result = intersect({
    type: "FeatureCollection",
    features: [first, second],
  } as FeatureCollection<Polygon | MultiPolygon>);
  const geometry = normalizeSurface(result?.geometry ?? null);
  return geometry ? surfaceFeature(geometry) : null;
}

export function unionSurfaces(features: SurfaceFeature[]): SurfaceFeature {
  if (!features[0]) throw new Error("Aucune surface à réunir.");
  if (features.length === 1) return features[0];
  const result = union({
    type: "FeatureCollection",
    features,
  } as FeatureCollection<Polygon | MultiPolygon>);
  const geometry = normalizeSurface(result?.geometry ?? null);
  if (!geometry) throw new Error("Les surfaces n’ont pas pu être réunies.");
  return surfaceFeature(geometry);
}

export function surfaceAreaSquareMeters(feature: SurfaceFeature): number {
  return Math.round(area(feature));
}

export function geometryBbox(geometry: SurfaceGeometry): [number, number, number, number] {
  const positions = exteriorPositions(geometry);
  if (!positions.length) throw new Error("La surface ne contient aucune coordonnée.");
  const longitudes = positions.map((position) => Number(position[0]));
  const latitudes = positions.map((position) => Number(position[1]));
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}
