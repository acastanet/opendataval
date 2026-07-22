import type pg from "pg";
import {
  STATIONS_METEO,
  type StationMeteo,
} from "@opendata-vda/shared/stations-meteo";

export const STATION_SELECTION_POLICY_VERSION = "1" as const;

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

export interface SelectionTarget {
  latitude: number;
  longitude: number;
  altitudeM: number | null;
}

export type StationSelectionStatus =
  | "selected"
  | "no_measurements"
  | "no_eligible_station";

export type StationSelectionReasonCode =
  | "BEST_ELIGIBLE_STATION"
  | "NO_VALID_MEASUREMENTS"
  | "NO_ELIGIBLE_STATION";

export type StationRejectionReason =
  | "INVALID_TEMPERATURE"
  | "INVALID_TIMESTAMP"
  | "FUTURE_TIMESTAMP"
  | "TOO_OLD"
  | "TOO_FAR"
  | "ALTITUDE_UNKNOWN_TOO_FAR"
  | "ALTITUDE_MISMATCH"
  | "SCORE_TOO_HIGH"
  | "ELIGIBLE_NOT_SELECTED";

export interface StationCandidateEvaluation {
  station: StationMeteo;
  temperatureC: number;
  observedAt: string;
  distanceKm: number;
  altitudeDifferenceM: number | null;
  ageMinutes: number | null;
  selectionScore: number | null;
  stale: boolean | null;
  measurementValid: boolean;
  eligible: boolean;
  selected: boolean;
  rejectionReasons: StationRejectionReason[];
}

export interface StationSelectionDecision {
  policyVersion: typeof STATION_SELECTION_POLICY_VERSION;
  status: StationSelectionStatus;
  reasonCode: StationSelectionReasonCode;
  receivedMeasurements: number;
  evaluatedCandidates: number;
  eligibleCandidates: number;
  selectedStationId: string | null;
  selected: SelectedStationObservation | null;
  candidates: StationCandidateEvaluation[];
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

function evaluateCandidate(
  target: SelectionTarget,
  measurement: StationMeasurement,
  now: Date,
): StationCandidateEvaluation {
  const rejectionReasons: StationRejectionReason[] = [];
  const validTemperature = Number.isFinite(measurement.temperatureC)
    && measurement.temperatureC >= -60
    && measurement.temperatureC <= 60;
  if (!validTemperature) rejectionReasons.push("INVALID_TEMPERATURE");

  const observedAtMs = Date.parse(measurement.observedAt);
  const validTimestamp = Number.isFinite(observedAtMs);
  if (!validTimestamp) rejectionReasons.push("INVALID_TIMESTAMP");

  const stationDistanceKm = distanceKm(target, measurement.station);
  const roundedDistanceKm = round(stationDistanceKm);
  if (stationDistanceKm > STATION_SELECTION_POLICY.maxDistanceKm) {
    rejectionReasons.push("TOO_FAR");
  }
  if (
    target.altitudeM === null
    && stationDistanceKm > STATION_SELECTION_POLICY.maxDistanceWithoutAltitudeKm
  ) {
    rejectionReasons.push("ALTITUDE_UNKNOWN_TOO_FAR");
  }

  const altitudeDifferenceM = target.altitudeM === null
    ? null
    : Math.abs(target.altitudeM - measurement.station.altitudeM);
  if (
    altitudeDifferenceM !== null
    && altitudeDifferenceM > STATION_SELECTION_POLICY.maxAltitudeDifferenceM
  ) {
    rejectionReasons.push("ALTITUDE_MISMATCH");
  }

  let ageMinutes: number | null = null;
  let stale: boolean | null = null;
  let selectionScore: number | null = null;

  if (validTimestamp) {
    const rawAgeMinutes = (now.getTime() - observedAtMs) / 60_000;
    ageMinutes = round(Math.max(0, rawAgeMinutes));
    stale = rawAgeMinutes > STATION_SELECTION_POLICY.staleAfterMinutes;
    if (rawAgeMinutes < -STATION_SELECTION_POLICY.futureToleranceMinutes) {
      rejectionReasons.push("FUTURE_TIMESTAMP");
    }
    if (rawAgeMinutes > STATION_SELECTION_POLICY.maxAgeMinutes) {
      rejectionReasons.push("TOO_OLD");
    }

    if (validTemperature) {
      const distancePenalty = (stationDistanceKm / STATION_SELECTION_POLICY.maxDistanceKm) * 50;
      const altitudePenalty = altitudeDifferenceM === null
        ? 8
        : (altitudeDifferenceM / STATION_SELECTION_POLICY.maxAltitudeDifferenceM) * 30;
      const freshnessPenalty = (Math.max(0, rawAgeMinutes) / STATION_SELECTION_POLICY.maxAgeMinutes) * 20;
      const networkPenalty = measurement.station.reseau === "infoclimat" ? 5 : 0;
      const rawScore = distancePenalty + altitudePenalty + freshnessPenalty + networkPenalty;
      selectionScore = round(rawScore);
      if (rawScore > STATION_SELECTION_POLICY.maxScore) {
        rejectionReasons.push("SCORE_TOO_HIGH");
      }
    }
  }

  const measurementValid = validTemperature && validTimestamp;
  return {
    ...measurement,
    distanceKm: roundedDistanceKm,
    altitudeDifferenceM,
    ageMinutes,
    selectionScore,
    stale,
    measurementValid,
    eligible: measurementValid && rejectionReasons.length === 0,
    selected: false,
    rejectionReasons,
  };
}

function compareEligibleCandidates(
  a: StationCandidateEvaluation,
  b: StationCandidateEvaluation,
): number {
  return (a.selectionScore ?? Number.POSITIVE_INFINITY)
    - (b.selectionScore ?? Number.POSITIVE_INFINITY)
    || Number(a.station.reseau === "infoclimat") - Number(b.station.reseau === "infoclimat")
    || a.distanceKm - b.distanceKm
    || (a.ageMinutes ?? Number.POSITIVE_INFINITY) - (b.ageMinutes ?? Number.POSITIVE_INFINITY)
    || a.station.id.localeCompare(b.station.id);
}

/**
 * Évalue toutes les mesures et conserve la décision complète. Les motifs de
 * rejet sont destinés aux tests, aux logs et au futur contrat de provenance ;
 * aucune donnée de diagnostic n'est encore exposée par l'API publique.
 */
export function evaluateStationObservations(
  target: SelectionTarget,
  measurements: readonly StationMeasurement[],
  now = new Date(),
): StationSelectionDecision {
  const candidates = measurements.map((measurement) => evaluateCandidate(target, measurement, now));
  const evaluatedCandidates = candidates.filter((candidate) => candidate.measurementValid).length;
  const eligible = candidates.filter((candidate) => candidate.eligible).sort(compareEligibleCandidates);
  const selectedCandidate = eligible[0] ?? null;

  for (const candidate of candidates) {
    if (candidate === selectedCandidate) {
      candidate.selected = true;
    } else if (candidate.eligible) {
      candidate.rejectionReasons.push("ELIGIBLE_NOT_SELECTED");
    }
  }

  const selected: SelectedStationObservation | null = selectedCandidate
    ? {
      station: selectedCandidate.station,
      temperatureC: selectedCandidate.temperatureC,
      observedAt: selectedCandidate.observedAt,
      distanceKm: selectedCandidate.distanceKm,
      altitudeDifferenceM: selectedCandidate.altitudeDifferenceM,
      ageMinutes: selectedCandidate.ageMinutes as number,
      selectionScore: selectedCandidate.selectionScore as number,
      stale: selectedCandidate.stale as boolean,
    }
    : null;

  const status: StationSelectionStatus = selected
    ? "selected"
    : evaluatedCandidates === 0
      ? "no_measurements"
      : "no_eligible_station";
  const reasonCode: StationSelectionReasonCode = selected
    ? "BEST_ELIGIBLE_STATION"
    : evaluatedCandidates === 0
      ? "NO_VALID_MEASUREMENTS"
      : "NO_ELIGIBLE_STATION";

  return {
    policyVersion: STATION_SELECTION_POLICY_VERSION,
    status,
    reasonCode,
    receivedMeasurements: measurements.length,
    evaluatedCandidates,
    eligibleCandidates: eligible.length,
    selectedStationId: selected?.station.id ?? null,
    selected,
    candidates,
  };
}

/**
 * Vue de compatibilité utilisée par le contrat 1.2.0. Toute la sélection passe
 * désormais par evaluateStationObservations afin de conserver un diagnostic
 * structuré sans modifier la réponse publique actuelle.
 */
export function selectStationObservation(
  target: SelectionTarget,
  measurements: readonly StationMeasurement[],
  now = new Date(),
): SelectedStationObservation | null {
  return evaluateStationObservations(target, measurements, now).selected;
}
