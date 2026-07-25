import { createHash } from "node:crypto";

export const FIRMS_SOURCES = [
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
  "MODIS_NRT",
] as const;

export type FirmsSource = (typeof FIRMS_SOURCES)[number];
export type DetectionSource =
  | `FIRMS_${FirmsSource}`
  | "EUMETSAT_MTG_CAP";
export type ConfidenceLevel = "low" | "nominal" | "high" | "unknown";
export type SourceState = "available" | "unavailable" | "not_configured";

export interface FireDetection {
  id: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  observed_at: string;
  source: DetectionSource;
  satellite: string | null;
  instrument: string | null;
  confidence: { raw: string | number | null; normalized: ConfidenceLevel };
  certainty: string | null;
  frp_mw: number | null;
  daynight: string | null;
  type_code: number | null;
  pixel_radius_km: number | null;
  classification: "unconfirmed_fire_suspicion";
}

export interface SourceReport {
  source: string;
  state: SourceState;
  retrieved_at: string;
  latest_observation_at: string | null;
  detection_count: number;
  detail?: string;
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface FirmsQueryWindow {
  dayRange: number;
  startDate?: string;
}

export function round(value: number, digits = 5): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function boundingBox(latitude: number, longitude: number, radiusKm: number): BoundingBox {
  const latitudeDelta = radiusKm / 110.574;
  const cosine = Math.max(Math.cos(latitude * Math.PI / 180), 0.01);
  const longitudeDelta = Math.min(180, radiusKm / (111.320 * cosine));
  return {
    west: Math.max(-180, longitude - longitudeDelta),
    south: Math.max(-90, latitude - latitudeDelta),
    east: Math.min(180, longitude + longitudeDelta),
    north: Math.min(90, latitude + latitudeDelta),
  };
}

export function utcDateOffset(days: number, now = new Date()): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return value.toISOString().slice(0, 10);
}

export function firmsQueryWindows(historyDays: number, now = new Date()): FirmsQueryWindow[] {
  const bounded = Math.max(1, Math.min(7, Math.floor(historyDays)));
  if (bounded <= 5) return [{ dayRange: bounded }];
  return [
    { dayRange: 5 },
    { dayRange: bounded - 5, startDate: utcDateOffset(-(bounded - 1), now) },
  ];
}

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"'; index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += character;
  }
  if (value.length || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  if (quoted) throw new Error("CSV FIRMS invalide : guillemet non fermé");
  return rows.filter((candidate) => candidate.some((entry) => entry.trim() !== ""));
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeConfidence(raw: string | number | null): ConfidenceLevel {
  if (raw === null) return "unknown";
  const text = String(raw).trim().toLowerCase();
  if (["l", "low"].includes(text)) return "low";
  if (["n", "nominal", "medium", "m"].includes(text)) return "nominal";
  if (["h", "high"].includes(text)) return "high";
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    if (numeric < 30) return "low";
    if (numeric < 80) return "nominal";
    return "high";
  }
  return "unknown";
}

function firmsObservedAt(date: string | undefined, time: string | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const digits = (time ?? "").replace(/\D/g, "").padStart(4, "0").slice(-4);
  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2, 4));
  if (hour > 23 || minute > 59) return null;
  return `${date}T${digits.slice(0, 2)}:${digits.slice(2, 4)}:00.000Z`;
}

function detectionId(parts: Array<string | number | null>): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export function parseFirmsCsv(
  csv: string,
  source: FirmsSource,
  center: { latitude: number; longitude: number },
  radiusKm: number,
): FireDetection[] {
  const rows = csvRows(csv);
  if (rows.length === 0) throw new Error("CSV FIRMS vide");
  const headers = rows[0]!.map((header) => header.trim().toLowerCase());
  const required = ["latitude", "longitude", "acq_date", "acq_time"];
  for (const field of required) if (!headers.includes(field)) throw new Error(`CSV FIRMS sans colonne ${field}`);
  const index = (name: string) => headers.indexOf(name);
  const detections: FireDetection[] = [];
  for (const row of rows.slice(1)) {
    const latitude = parseNumber(row[index("latitude")]);
    const longitude = parseNumber(row[index("longitude")]);
    const observedAt = firmsObservedAt(row[index("acq_date")], row[index("acq_time")]);
    if (latitude === null || longitude === null || observedAt === null) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
    const distanceKm = haversineKm(center.latitude, center.longitude, latitude, longitude);
    if (distanceKm > radiusKm) continue;
    const rawConfidence = row[index("confidence")]?.trim() || null;
    const frp = parseNumber(row[index("frp")]);
    const typeCode = parseNumber(row[index("type")]);
    const satellite = row[index("satellite")]?.trim() || null;
    const instrument = row[index("instrument")]?.trim() || null;
    const daynight = row[index("daynight")]?.trim() || null;
    detections.push({
      id: detectionId([source, observedAt, round(latitude, 5), round(longitude, 5), satellite]),
      latitude,
      longitude,
      distance_km: round(distanceKm, 2),
      observed_at: observedAt,
      source: `FIRMS_${source}`,
      satellite,
      instrument,
      confidence: { raw: rawConfidence, normalized: normalizeConfidence(rawConfidence) },
      certainty: null,
      frp_mw: frp,
      daynight,
      type_code: typeCode === null ? null : Math.trunc(typeCode),
      pixel_radius_km: source === "MODIS_NRT" ? 0.5 : 0.1875,
      classification: "unconfirmed_fire_suspicion",
    });
  }
  return detections;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<(?:(?:\\w+):)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${name}>`, "i"));
  return match?.[1] === undefined ? null : decodeXml(match[1].replace(/<[^>]+>/g, ""));
}

function blocks(input: string, name: string): string[] {
  return [...input.matchAll(new RegExp(`<(?:(?:\\w+):)?${name}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:(?:\\w+):)?${name}>`, "gi"))]
    .map((match) => match[0]);
}

function validIso(...values: Array<string | null>): string | null {
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return null;
}

function capParameters(info: string): Map<string, string> {
  const parameters = new Map<string, string>();
  for (const parameter of blocks(info, "parameter")) {
    const name = tag(parameter, "valueName")?.toLowerCase();
    const value = tag(parameter, "value");
    if (name && value) parameters.set(name, value);
  }
  return parameters;
}

function parseCircle(value: string): { latitude: number; longitude: number; radiusKm: number | null } | null {
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s+([0-9]+(?:\.\d+)?))?\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]); const longitude = Number(match[2]);
  const radiusKm = match[3] === undefined ? null : Number(match[3]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude, radiusKm: radiusKm !== null && Number.isFinite(radiusKm) ? radiusKm : null };
}

export function parseCapXml(
  xml: string,
  source: "EUMETSAT_MTG_CAP",
  center: { latitude: number; longitude: number },
  radiusKm: number,
): FireDetection[] {
  if (!/<(?:(?:\w+):)?alert\b/i.test(xml)) throw new Error("Produit EUMETSAT CAP invalide");
  const detections: FireDetection[] = [];
  for (const alert of blocks(xml, "alert")) {
    const identifier = tag(alert, "identifier") ?? "unknown";
    const sent = tag(alert, "sent");
    for (const info of blocks(alert, "info")) {
      const certainty = tag(info, "certainty");
      const severity = tag(info, "severity");
      const observedAt = validIso(tag(info, "effective"), tag(info, "onset"), sent);
      if (!observedAt) continue;
      const parameters = capParameters(info);
      const rawConfidence = parameters.get("fireresult")
        ?? parameters.get("fireconfidence")
        ?? parameters.get("confidence")
        ?? severity
        ?? null;
      const frp = parseNumber(parameters.get("frp") ?? parameters.get("fire radiative power"));
      const satellite = parameters.get("satellite") ?? "Meteosat-12";
      const instrument = parameters.get("instrument") ?? "FCI";
      const areaBlocks = blocks(info, "area");
      const circleBlocks = areaBlocks.length ? areaBlocks.flatMap((area) => blocks(area, "circle")) : blocks(info, "circle");
      for (const circleBlock of circleBlocks) {
        const circle = parseCircle(tag(circleBlock, "circle") ?? circleBlock.replace(/<[^>]+>/g, "").trim());
        if (!circle) continue;
        const distanceKm = haversineKm(center.latitude, center.longitude, circle.latitude, circle.longitude);
        if (distanceKm > radiusKm) continue;
        detections.push({
          id: detectionId([source, identifier, observedAt, round(circle.latitude, 5), round(circle.longitude, 5)]),
          latitude: circle.latitude,
          longitude: circle.longitude,
          distance_km: round(distanceKm, 2),
          observed_at: observedAt,
          source,
          satellite,
          instrument,
          confidence: { raw: rawConfidence, normalized: normalizeConfidence(rawConfidence) },
          certainty,
          frp_mw: frp,
          daynight: null,
          type_code: null,
          pixel_radius_km: circle.radiusKm,
          classification: "unconfirmed_fire_suspicion",
        });
      }
    }
  }
  return deduplicateDetections(detections);
}

export function deduplicateDetections(detections: FireDetection[]): FireDetection[] {
  const byId = new Map<string, FireDetection>();
  for (const detection of detections) byId.set(detection.id, detection);
  return [...byId.values()].sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at));
}

export function latestObservation(detections: FireDetection[]): string | null {
  return detections.length ? detections.reduce((latest, detection) => detection.observed_at > latest ? detection.observed_at : latest, detections[0]!.observed_at) : null;
}
