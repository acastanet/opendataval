import type { FeatureCollection, Point } from "geojson";
import type { OldConfig } from "./config.js";
import type { OldSourceClients, SurfaceGeometry } from "./types.js";

function pointGeometry(lon: number, lat: number): Point {
  return { type: "Point", coordinates: [lon, lat] };
}

function around(lon: number, lat: number, meters: number): [number, number, number, number] {
  const latitudeDelta = meters / 111_320;
  const longitudeDelta = meters / (111_320 * Math.cos(lat * Math.PI / 180));
  return [
    lon - longitudeDelta,
    lat - latitudeDelta,
    lon + longitudeDelta,
    lat + latitudeDelta,
  ];
}

function asFeatureCollection(value: unknown, source: string): FeatureCollection {
  if (
    typeof value !== "object" || value === null ||
    !("type" in value) || value.type !== "FeatureCollection" ||
    !("features" in value) || !Array.isArray(value.features)
  ) {
    throw new Error(`${source} a renvoyé un GeoJSON invalide.`);
  }
  return value as FeatureCollection;
}

export function createSourceClients(config: OldConfig, fetchImpl: typeof fetch): OldSourceClients {
  const json = async (url: URL, source: string): Promise<FeatureCollection> => {
    const response = await fetchImpl(url, {
      headers: { accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    if (!response.ok) throw new Error(`${source} a répondu HTTP ${response.status}.`);
    return asFeatureCollection(await response.json(), source);
  };

  const wfs = async (
    typeName: string,
    bbox: [number, number, number, number],
    count: number,
    source: string,
    propertyNames?: string[],
  ): Promise<FeatureCollection> => {
    const [west, south, east, north] = bbox;
    const url = new URL(config.wfsUrl);
    const parameters = new URLSearchParams({
      SERVICE: "WFS",
      VERSION: "2.0.0",
      REQUEST: "GetFeature",
      TYPENAMES: typeName,
      BBOX: `${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`,
      SRSNAME: "urn:ogc:def:crs:EPSG::4326",
      outputFormat: "application/json",
      COUNT: String(count),
    });
    if (propertyNames?.length) parameters.set("PROPERTYNAME", propertyNames.join(","));
    url.search = parameters.toString();
    return json(url, source);
  };

  const apiCarto = (
    path: string,
    geometry: SurfaceGeometry | Point,
    source: string,
  ): Promise<FeatureCollection> => {
    const url = new URL(`${config.apiCartoUrl}${path}`);
    url.searchParams.set("geom", JSON.stringify(geometry));
    return json(url, source);
  };

  return {
    buildings: (lon, lat) => wfs(
      "BDTOPO_V3:batiment",
      around(lon, lat, config.buildingSearchRadiusMeters),
      100,
      "IGN BD TOPO",
    ),
    parcel: (lon, lat) => apiCarto(
      "/cadastre/parcelle",
      pointGeometry(lon, lat),
      "API Carto Cadastre",
    ),
    urbanism: (geometry) => apiCarto(
      "/gpu/zone-urba",
      geometry,
      "API Carto GPU",
    ),
    applicability: (lon, lat) => wfs(
      "DEBROUSSAILLEMENT:debroussaillement",
      around(lon, lat, 2),
      20,
      "IGN DÉBROUSSAILLEMENT",
      ["id", "dept", "source", "millesime", "zonage", "url", "date_integ", "dat_ap_old"],
    ),
  };
}
