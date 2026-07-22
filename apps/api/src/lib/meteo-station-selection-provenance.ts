import type { PublicStationSelection } from "./meteo-provenance.js";
import {
  STATION_SELECTION_POLICY,
  type StationCandidateEvaluation,
  type StationRejectionReason,
  type StationSelectionDecision,
} from "./station-observations.js";

export interface PublicStationSelectionCriteria {
  maximumDistanceKm: number;
  maximumDistanceWithoutAltitudeKm: number;
  maximumAltitudeDifferenceM: number;
  maximumObservationAgeMinutes: number;
  staleAfterMinutes: number;
  futureToleranceMinutes: number;
  maximumSelectionScore: number;
}

export interface PublicStationCandidate {
  id: string;
  name: string;
  network: "meteofrance" | "infoclimat";
  altitudeM: number;
  distanceKm: number;
  altitudeDifferenceM: number | null;
  observedAt: string | null;
  ageMinutes: number | null;
  selectionScore: number | null;
  measurementValid: boolean;
  eligible: boolean;
  selected: boolean;
  rejectionReasons: StationRejectionReason[];
}

export interface PublicStationRejectionCount {
  reason: StationRejectionReason;
  count: number;
}

export interface PublicStationSelectionWithDiagnostics extends PublicStationSelection {
  message: string;
  receivedMeasurements: number | null;
  criteria: PublicStationSelectionCriteria;
  nearestCandidate: PublicStationCandidate | null;
  rejectionSummary: PublicStationRejectionCount[];
}

const REJECTION_REASON_ORDER: readonly StationRejectionReason[] = [
  "INVALID_TEMPERATURE",
  "INVALID_TIMESTAMP",
  "FUTURE_TIMESTAMP",
  "TOO_OLD",
  "TOO_FAR",
  "ALTITUDE_UNKNOWN_TOO_FAR",
  "ALTITUDE_MISMATCH",
  "SCORE_TOO_HIGH",
  "ELIGIBLE_NOT_SELECTED",
];

const PUBLIC_CRITERIA: PublicStationSelectionCriteria = {
  maximumDistanceKm: STATION_SELECTION_POLICY.maxDistanceKm,
  maximumDistanceWithoutAltitudeKm: STATION_SELECTION_POLICY.maxDistanceWithoutAltitudeKm,
  maximumAltitudeDifferenceM: STATION_SELECTION_POLICY.maxAltitudeDifferenceM,
  maximumObservationAgeMinutes: STATION_SELECTION_POLICY.maxAgeMinutes,
  staleAfterMinutes: STATION_SELECTION_POLICY.staleAfterMinutes,
  futureToleranceMinutes: STATION_SELECTION_POLICY.futureToleranceMinutes,
  maximumSelectionScore: STATION_SELECTION_POLICY.maxScore,
};

function validObservedAt(candidate: StationCandidateEvaluation): string | null {
  const timestamp = Date.parse(candidate.observedAt);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function publicCandidate(candidate: StationCandidateEvaluation): PublicStationCandidate {
  return {
    id: candidate.station.id,
    name: candidate.station.nom,
    network: candidate.station.reseau,
    altitudeM: candidate.station.altitudeM,
    distanceKm: candidate.distanceKm,
    altitudeDifferenceM: candidate.altitudeDifferenceM,
    observedAt: validObservedAt(candidate),
    ageMinutes: candidate.ageMinutes,
    selectionScore: candidate.selectionScore,
    measurementValid: candidate.measurementValid,
    eligible: candidate.eligible,
    selected: candidate.selected,
    rejectionReasons: [...candidate.rejectionReasons],
  };
}

function nearestCandidate(
  decision: StationSelectionDecision | null,
): PublicStationCandidate | null {
  if (!decision || decision.candidates.length === 0) return null;
  const candidate = [...decision.candidates].sort(
    (a, b) => a.distanceKm - b.distanceKm || a.station.id.localeCompare(b.station.id),
  )[0];
  return candidate ? publicCandidate(candidate) : null;
}

function rejectionSummary(
  decision: StationSelectionDecision | null,
): PublicStationRejectionCount[] {
  if (!decision) return [];
  const counts = new Map<StationRejectionReason, number>();
  for (const candidate of decision.candidates) {
    for (const reason of candidate.rejectionReasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return REJECTION_REASON_ORDER.flatMap((reason) => {
    const count = counts.get(reason) ?? 0;
    return count > 0 ? [{ reason, count }] : [];
  });
}

function selectionMessage(status: PublicStationSelection["status"]): string {
  switch (status) {
    case "selected":
      return "Une station suffisamment représentative a été retenue.";
    case "no_measurements":
      return "Aucune observation locale valide n’a été reçue.";
    case "no_eligible_station":
      return "Aucune station observée ne respecte tous les critères de représentativité.";
    case "provider_unavailable":
      return "Les observations locales sont momentanément indisponibles.";
    case "not_evaluated":
      return "La sélection d’une station locale n’a pas été exécutée.";
  }
}

export function addStationSelectionDiagnostics(
  base: PublicStationSelection,
  decision: StationSelectionDecision | null,
): PublicStationSelectionWithDiagnostics {
  return {
    ...base,
    message: selectionMessage(base.status),
    receivedMeasurements: decision?.receivedMeasurements ?? null,
    criteria: { ...PUBLIC_CRITERIA },
    nearestCandidate: nearestCandidate(decision),
    rejectionSummary: rejectionSummary(decision),
  };
}
