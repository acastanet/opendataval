import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WeatherProvenance } from "../api/contracts";
import { essentialWeatherFixture } from "../mocks/fixtures";
import { DataProvenancePanel } from "./DataProvenancePanel";

afterEach(cleanup);

function rejectedStationProvenance(): WeatherProvenance {
  const base = essentialWeatherFixture({ latitude: 48.8566, longitude: 2.3522 }).provenance;
  return {
    ...base,
    schemaVersion: "1.1",
    stationSelection: {
      policyVersion: "1",
      status: "no_eligible_station",
      reasonCode: "NO_ELIGIBLE_STATION",
      message: "Aucune station observée ne respecte tous les critères de représentativité.",
      receivedMeasurements: 3,
      evaluatedCandidates: 3,
      eligibleCandidates: 0,
      selectedStationId: null,
      criteria: {
        maximumDistanceKm: 50,
        maximumDistanceWithoutAltitudeKm: 5,
        maximumAltitudeDifferenceM: 500,
        maximumObservationAgeMinutes: 90,
        staleAfterMinutes: 60,
        futureToleranceMinutes: 15,
        maximumSelectionScore: 60,
      },
      nearestCandidate: {
        id: "07156",
        name: "Paris-Montsouris",
        network: "meteofrance",
        altitudeM: 75,
        distanceKm: 4.8,
        altitudeDifferenceM: 40,
        observedAt: "2026-07-22T17:11:00.000Z",
        ageMinutes: 124,
        selectionScore: 38.4,
        measurementValid: true,
        eligible: false,
        selected: false,
        rejectionReasons: ["TOO_OLD"],
      },
      rejectionSummary: [{ reason: "TOO_OLD", count: 3 }],
    },
  };
}

describe("DataProvenancePanel", () => {
  it("explique la station la plus proche et son motif de rejet", () => {
    render(<DataProvenancePanel provenance={rejectedStationProvenance()} />);

    expect(
      screen.getByText(
        "Aucune station suffisamment représentative. La température affichée provient donc du modèle.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Prévision modélisée")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("D’où viennent ces données ?"));

    expect(screen.getByText("Station la plus proche examinée")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paris-Montsouris" })).toBeInTheDocument();
    expect(screen.getByText("4,8 km")).toBeInTheDocument();
    expect(screen.getByText("2 h 04")).toBeInTheDocument();
    expect(screen.getByText("Observation trop ancienne")).toBeInTheDocument();
    expect(screen.getByText(/Distance maximale 50 km/)).toBeInTheDocument();
    expect(screen.queryByText("TOO_OLD")).not.toBeInTheDocument();
  });

  it("reste lisible pendant une transition avec une réponse de provenance 1.0", () => {
    const base = essentialWeatherFixture({ latitude: 43.2965, longitude: 5.3698 }).provenance;
    const provenance = {
      ...base,
      stationSelection: {
        policyVersion: "1",
        status: "no_eligible_station",
        reasonCode: "NO_ELIGIBLE_STATION",
        evaluatedCandidates: 2,
        eligibleCandidates: 0,
        selectedStationId: null,
      },
    } as WeatherProvenance;

    render(<DataProvenancePanel provenance={provenance} />);
    fireEvent.click(screen.getByText("D’où viennent ces données ?"));

    expect(
      screen.getByText("2 mesure(s) locale(s) ont été évaluées, sans station suffisamment représentative."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Station la plus proche examinée")).not.toBeInTheDocument();
  });
});
