import type pg from "pg";
import {
  STATIONS_METEO,
  type StationMeteo,
} from "@opendata-vda/shared/stations-meteo";

export const STATION_SELECTION_POLICY = {
  maxDistanceKm: 50,
  maxDistanceWithoutAltitudeKm: 5,
  maxAltitudeDifferenceM: 500,
  maxAgeMinutes: 90,
  staleAfterMinutes: 60,
  futureToleranceMinutes: 15,
  maxScore: 60,
} as const;

export interface StationMeasurement {
  station: StationMeteo;
  temperatureC: number;
  observedAt: string;
}

export interface SelectedStationObservation {
  station: StationMeteo;
  temperatureC: number;
  observedAt: string;
  distanceKm: number;
  altitudeDifferenceM: number | null;
  ageMinutes: number;
  selectionScore: number;
  stale: boolean;
}

interface SelectionTarget {
  latitude: number;
  longitude: number;
  altitudeM: number | null;
}

interface LatestObservationRow {
  num_poste?: unknown;
  t?: unknown;
  heure_utc?: unknown;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function distanceKm(
  a: { latitude: number; longitude: number },
  b: { lat: number; lon: number },
): number {
  const earthRadiusKm = 6_371;
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(b.lat - a.latitude);
  const deltaLongitude = radians(b.lon - a.longitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(a.latitude))
      * Math.cos(radians(b.lat))
      * Math.sin(deltaLongitude / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  return earthRadiusKm * 2 * Math.atan2(
    Math.sqrt(boundedHaversine),
    Math.sqrt(1 - boundedHaversine),
  );
}

function temperature(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;
  return Number.isFinite(parsed) && parsed >= -60 && parsed <= 60 ? parsed : null;
}

function timestamp(value: unknown): string | null {
  const date = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Charge une seule température récente par station. La géométrie et les
 * caractéristiques des stations restent issues du catalogue partagé, jamais
 * des lignes de mesure.
 */
export async function loadLatestStationMeasurements(
  pool: pg.Pool,
  stations: readonly StationMeteo[] = STATIONS_METEO,
): Promise<StationMeasurement[]> {
  if (stations.length === 0) return [];
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const { rows } = await pool.query<LatestObservationRow>(
    `select distinct on (num_poste) num_poste, t, heure_utc
     from series.meteo_horaire
     where num_poste = any($1::text[]) and t is not null
     order by num_poste, heure_utc desc`,
    [[...stationById.keys()]],
  );

  const measurements: StationMeasurement[] = [];
  for (const row of rows) {
    const station = stationById.get(String(row.num_poste ?? ""));
    const temperatureC = temperature(row.t);
    const observedAt = timestamp(row.heure_utc);
    if (!station || temperatureC === null || observedAt === null) continue;
    measurements.push({ station, temperatureC, observedAt });
  }
  return measurements;
}

/**
 * Classe les observations selon leur représentativité pour le point demandé.
 * Le score (plus bas = meilleur) pondère la distance à 50 %, l'écart
 * d'altitude à 30 % et la fraîcheur à 20 %. Une station amateur reçoit une
 * pénalité légère, mais peut être retenue lorsqu'elle est nettement plus locale.
 */
export function selectStationObservation(
  target: SelectionTarget,
  measurements: readonly StationMeasurement[],
  now = new Date(),
): SelectedStationObservation | null {
  const candidates: SelectedStationObservation[] = [];

  for (const measurement of measurements) {
    if (
      !Number.isFinite(measurement.temperatureC)
      || measurement.temperatureC < -60
      || measurement.temperatureC > 60
    ) continue;
    const observedAtMs = Date.parse(measurement.observedAt);
    if (!Number.isFinite(observedAtMs)) continue;
    const rawAgeMinutes = (now.getTime() - observedAtMs) / 60_000;
    if (rawAgeMinutes < -STATION_SELECTION_POLICY.futureToleranceMinutes) continue;
    const ageMinutes = Math.max(0, rawAgeMinutes);
    if (ageMinutes > STATION_SELECTION_POLICY.maxAgeMinutes) continue;

    const stationDistanceKm = distanceKm(target, measurement.station);
    if (stationDistanceKm > STATION_SELECTION_POLICY.maxDistanceKm) continue;
    if (
      target.altitudeM === null
      && stationDistanceKm > STATION_SELECTION_POLICY.maxDistanceWithoutAltitudeKm
    ) continue;

    const altitudeDifferenceM = target.altitudeM === null
      ? null
      : Math.abs(target.altitudeM - measurement.station.altitudeM);
    if (
      altitudeDifferenceM !== null
      && altitudeDifferenceM > STATION_SELECTION_POLICY.maxAltitudeDifferenceM
    ) continue;

    const distancePenalty = (stationDistanceKm / STATION_SELECTION_POLICY.maxDistanceKm) * 50;
    const altitudePenalty = altitudeDifferenceM === null
      ? 8
      : (altitudeDifferenceM / STATION_SELECTION_POLICY.maxAltitudeDifferenceM) * 30;
    const freshnessPenalty = (ageMinutes / STATION_SELECTION_POLICY.maxAgeMinutes) * 20;
    const networkPenalty = measurement.station.reseau === "infoclimat" ? 5 : 0;
    const selectionScore = distancePenalty + altitudePenalty + freshnessPenalty + networkPenalty;
    if (selectionScore > STATION_SELECTION_POLICY.maxScore) continue;

    candidates.push({
      ...measurement,
      distanceKm: round(stationDistanceKm),
      altitudeDifferenceM,
      ageMinutes: round(ageMinutes),
      selectionScore: round(selectionScore),
      stale: ageMinutes > STATION_SELECTION_POLICY.staleAfterMinutes,
    });
  }

  candidates.sort((a, b) =>
    a.selectionScore - b.selectionScore
    || Number(a.station.reseau === "infoclimat") - Number(b.station.reseau === "infoclimat")
    || a.distanceKm - b.distanceKm
    || a.ageMinutes - b.ageMinutes
    || a.station.id.localeCompare(b.station.id));

  return candidates[0] ?? null;
}
