export type PositionSource = "browser-geolocation" | "manual" | "unknown";

export interface Coordinates {
  latitude: number;
  longitude: number;
  horizontalAccuracyMeters?: number;
  positionSource: PositionSource;
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const MAX_INPUT_LENGTH = 32;
const MAX_HORIZONTAL_ACCURACY_METERS = 1_000_000;

function parseStrictNumber(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_INPUT_LENGTH || !NUMBER.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function parseCoordinates(query: Record<string, unknown>): Coordinates | null {
  const latitude = parseStrictNumber(query.lat);
  const longitude = parseStrictNumber(query.lon);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const rawAccuracy = query.horizontalAccuracyMeters;
  const horizontalAccuracyMeters = rawAccuracy === undefined ? undefined : parseStrictNumber(rawAccuracy);
  if (horizontalAccuracyMeters === null || (horizontalAccuracyMeters !== undefined && (horizontalAccuracyMeters <= 0 || horizontalAccuracyMeters > MAX_HORIZONTAL_ACCURACY_METERS))) return null;
  const positionSource = query.positionSource === undefined ? "unknown" : query.positionSource;
  if (positionSource !== "browser-geolocation" && positionSource !== "manual" && positionSource !== "unknown") return null;
  return { latitude, longitude, ...(horizontalAccuracyMeters === undefined ? {} : { horizontalAccuracyMeters }), positionSource };
}

export function distanceMeters(a: Pick<Coordinates, "latitude" | "longitude">, b: Pick<Coordinates, "latitude" | "longitude">): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
