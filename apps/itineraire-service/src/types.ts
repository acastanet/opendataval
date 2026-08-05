import type { LineString } from "geojson";

export interface VehicleInput {
  lonDepart: number;
  latDepart: number;
  lonArrivee: number;
  latArrivee: number;
  hauteurM: number;
  largeurM: number;
  longueurM: number;
  poidsT: number;
  chargeEssieuT: number;
  nbEssieux: number;
  matieresDangereuses: boolean;
}

export interface Restriction {
  wayId: string;
  tags: Record<string, string>;
  nom?: string;
  geometry?: LineString;
}

export interface RouteEdge { wayId: string; lengthKm: number; name?: string; roadClass?: string; geometry?: LineString; }

export interface RouteResult {
  durationS: number;
  distanceKm: number;
  geojson: LineString;
  steps: Array<{ instruction: string; distanceKm: number; durationS: number }>;
  edges: RouteEdge[];
}

export interface ValhallaClient {
  route(vehicle: VehicleInput, costing: "truck" | "auto"): Promise<RouteResult>;
}
