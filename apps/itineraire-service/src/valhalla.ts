import type { LineString } from "geojson";
import type { ItineraireConfig } from "./config.js";
import type { RouteEdge, RouteResult, ValhallaClient, VehicleInput } from "./types.js";

export class ValhallaUnavailableError extends Error {}
export class ValhallaRouteError extends Error {}

interface FetchLike { (input: string | URL | Request, init?: RequestInit): Promise<Response>; }

function decodeShape(shape: string): LineString {
  const coordinates: Array<[number, number]> = [];
  let index = 0; let latitude = 0; let longitude = 0;
  while (index < shape.length) {
    let value = 0; let shift = 0; let byte: number;
    do { byte = shape.charCodeAt(index++) - 63; value |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    latitude += (value & 1) ? ~(value >> 1) : value >> 1;
    value = 0; shift = 0;
    do { byte = shape.charCodeAt(index++) - 63; value |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    longitude += (value & 1) ? ~(value >> 1) : value >> 1;
    coordinates.push([longitude / 1_000_000, latitude / 1_000_000]);
  }
  return { type: "LineString", coordinates };
}

function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }

function traceEdges(payload: unknown): RouteEdge[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as { edges?: Array<Record<string, unknown>>; shape?: unknown };
  const shape = typeof response.shape === "string" ? decodeShape(response.shape).coordinates : [];
  return (response.edges ?? []).flatMap((edge) => {
    const id = edge.way_id;
    if (typeof id !== "string" && typeof id !== "number") return [];
    const names = Array.isArray(edge.names) ? edge.names : [];
    const name = names.find((item): item is string => typeof item === "string");
    const begin = typeof edge.begin_shape_index === "number" ? edge.begin_shape_index : -1;
    const end = typeof edge.end_shape_index === "number" ? edge.end_shape_index : -1;
    const coordinates = begin >= 0 && end >= begin ? shape.slice(begin, end + 1) : [];
    return [{ wayId: String(id), lengthKm: number(edge.length), name, roadClass: string(edge.road_class), ...(coordinates.length > 1 ? { geometry: { type: "LineString" as const, coordinates } } : {}) }];
  });
}

export function createValhallaClient(config: ItineraireConfig, fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)): ValhallaClient {
  async function post(path: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.valhallaUrl}${path}`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(config.valhallaTimeoutMs),
      });
    } catch (error) { throw new ValhallaUnavailableError("Valhalla est indisponible.", { cause: error }); }
    if (!response.ok) {
      if (response.status >= 500) throw new ValhallaUnavailableError(`Valhalla a répondu HTTP ${response.status}.`);
      throw new ValhallaRouteError(`Valhalla a refusé la demande (HTTP ${response.status}).`);
    }
    return response.json();
  }
  return {
    async route(vehicle, costing): Promise<RouteResult> {
      const payload = await post("/route", {
        // Conserver plusieurs candidats proches évite de raccorder un point de
        // géocodage à une bretelle ou une voie de service moins appropriée.
        locations: [{ lat: vehicle.latDepart, lon: vehicle.lonDepart, radius: 200 }, { lat: vehicle.latArrivee, lon: vehicle.lonArrivee, radius: 200 }],
        costing, units: "kilometers",
        ...(costing === "truck" ? { costing_options: { truck: {
          height: vehicle.hauteurM, width: vehicle.largeurM, length: vehicle.longueurM, weight: vehicle.poidsT,
          axle_load: vehicle.chargeEssieuT, axle_count: vehicle.nbEssieux, hazmat: vehicle.matieresDangereuses,
        } } } : {}),
      }) as { trip?: { summary?: { time?: unknown; length?: unknown }; shape?: unknown; legs?: Array<{ shape?: unknown; maneuvers?: Array<Record<string, unknown>> }> } };
      const trip = payload.trip;
      const shape = typeof trip?.shape === "string"
        ? trip.shape
        : trip?.legs?.[0] && typeof trip.legs[0].shape === "string"
          ? trip.legs[0].shape
          : undefined;
      if (!trip || !shape) throw new ValhallaUnavailableError("Réponse Valhalla incomplète.");
      const trace = await post("/trace_attributes", {
        shape: decodeShape(shape).coordinates.map(([lon, lat]) => ({ lat, lon })), shape_match: "edge_walk",
        costing, filters: { action: "include", attributes: ["edge.way_id", "edge.length", "edge.names", "edge.road_class", "edge.begin_shape_index", "edge.end_shape_index", "shape"] },
      });
      return {
        durationS: number(trip.summary?.time), distanceKm: number(trip.summary?.length), geojson: decodeShape(shape), edges: traceEdges(trace),
        steps: (trip.legs?.flatMap((leg) => leg.maneuvers ?? []) ?? []).map((maneuver) => ({
          instruction: string(maneuver.instruction) ?? "Continuer", distanceKm: number(maneuver.length), durationS: number(maneuver.time),
        })),
      };
    },
  };
}
