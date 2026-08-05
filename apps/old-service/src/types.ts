import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

export type SurfaceGeometry = Polygon | MultiPolygon;
export type SurfaceFeature = Feature<SurfaceGeometry, GeoJsonProperties>;
export type PointFeature = Feature<Point, GeoJsonProperties>;
export type GeoFeatureCollection = FeatureCollection<SurfaceGeometry | Point>;

export interface SourceState<T> {
  status: "available" | "unavailable";
  data: T | null;
  message: string | null;
}

export interface OldSourceClients {
  buildings(lon: number, lat: number): Promise<FeatureCollection>;
  parcel(lon: number, lat: number): Promise<FeatureCollection>;
  urbanism(geometry: SurfaceGeometry | Point): Promise<FeatureCollection>;
  applicability(lon: number, lat: number): Promise<FeatureCollection>;
}

export interface OldAnalysisInput {
  lon: number;
  lat: number;
  distanceMeters: number;
}
