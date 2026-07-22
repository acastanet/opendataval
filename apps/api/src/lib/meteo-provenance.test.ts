import assert from "node:assert/strict";
import test from "node:test";
import type { StationMeteo } from "@opendata-vda/shared/stations-meteo";
import type { ResolvedGeography } from "./geography.js";
import {
  buildEssentialProvenance,
  type EssentialProvenanceBuildInput,
} from "./meteo-provenance.js";
import type { StationSelectionDecision } from "./station-observations.js";

const retrievedAt = "2026-07-22T14:02:10.000Z";
const geography: ResolvedGeography = {
  coordinates: { latitude: 44.081192, longitude: 3.641467 },
  label: "Val-d’Aigoual",
  municipality: { name: "Val-d’Aigoual", inseeCode: "30339" },
  department: { name: "Gard", code: "30" },
  altitudeM: 354,
  resolution: { administrative: "ign", altitude: "ign" },
  unavailableSources: [],
  generatedAt: retrievedAt,
};

function baseInput(): EssentialProvenanceBuildInput {
  return {
    retrievedAt,
    geography,
    observationProviderUnavailable: false,
    stationDecision: {
      policyVersion: "1",
      status: "no_eligible_station",
      reasonCode: "NO_ELIGIBLE_STATION",
      receivedMeasurements: 3,
      evaluatedCandidates: 3,
      eligibleCandidates: 0,
      selectedStationId: null,
      selected: null,
      candidates: [],
    },
    model: {
      currentTemperatureAvailable: true,
      apparentTemperatureAvailable: true,
      weatherConditionAvailable: true,
      validAt: "2026-07-22T14:00:00.000Z",
      point: { latitude: 44.08, longitude: 3.64, altitudeM: 351 },
      todayRangeMode: "model",
      todayRangeValidAt: "2026-07-22T12:00:00.000Z",
      nextChangeMode: "derived",
      nextChangeValidAt: null,
      nextHoursMode: "model",
      nextHoursValidAt: "2026-07-22T15:00:00.000Z",
    },
    alert: {
      available: true,
      generatedAt: "2026-07-22T12:00:00.000Z",
      validAt: null,
    },
  };
}

function selectedDecision(): StationSelectionDecision {
  const station: StationMeteo = {
    id: "000UB",
    nom: "Valleraugue",
    altitudeM: 400,
    lat: 44.0828,
    lon: 3.62148,
    reseau: "infoclimat",
    licence: "CC BY-NC 4.0",
  };
  return {
    policyVersion: "1",
    status: "selected",
    reasonCode: "BEST_ELIGIBLE_STATION",
    receivedMeasurements: 2,
    evaluatedCandidates: 2,
    eligibleCandidates: 1,
    selectedStationId: "000UB",
    selected: {
      station,
      temperatureC: 23.4,
      observedAt: "2026-07-22T13:30:00.000Z",
      distanceKm: 1.6,
      altitudeDifferenceM: 46,
      ageMinutes: 32,
      selectionScore: 13.7,
      stale: false,
    },
    candidates: [],
  };
}

test("décrit une réponse entièrement modélisée sans station admissible", () => {
  const provenance = buildEssentialProvenance(baseInput());
  assert.equal(provenance.weatherMode, "model");
  assert.equal(provenance.values.currentTemperature.nature, "model");
  assert.equal(provenance.values.currentTemperature.time.observedAt, null);
  assert.equal(provenance.stationSelection.status, "no_eligible_station");
});

test("décrit explicitement une réponse hybride lorsqu’une station fournit la température", () => {
  const input = baseInput();
  input.stationDecision = selectedDecision();
  const provenance = buildEssentialProvenance(input);
  assert.equal(provenance.weatherMode, "hybrid");
  assert.equal(provenance.values.currentTemperature.nature, "observation");
  assert.equal(provenance.values.currentTemperature.station?.id, "000UB");
  assert.equal(provenance.values.apparentTemperature.nature, "model");
  assert.equal(provenance.stationSelection.selectedStationId, "000UB");
});

test("distingue la panne du fournisseur d’observations", () => {
  const input = baseInput();
  input.observationProviderUnavailable = true;
  input.stationDecision = null;
  const provenance = buildEssentialProvenance(input);
  assert.equal(provenance.weatherMode, "model");
  assert.equal(provenance.stationSelection.status, "provider_unavailable");
  assert.equal(provenance.stationSelection.evaluatedCandidates, null);
  assert.match(provenance.summary, /indisponibles/);
});

test("n’invente pas la géographie ni la vigilance lorsque l’IGN échoue", () => {
  const input = baseInput();
  input.geography = {
    ...geography,
    municipality: null,
    department: null,
    altitudeM: null,
    resolution: { administrative: "unavailable", altitude: "unavailable" },
  };
  input.alert.available = false;
  const provenance = buildEssentialProvenance(input);
  assert.equal(provenance.values.municipality.status, "unavailable");
  assert.equal(provenance.values.department.source, null);
  assert.equal(provenance.values.altitude.nature, "unavailable");
  assert.equal(provenance.values.alert.status, "unavailable");
});

test("signale les valeurs de repli sans les présenter comme des données du modèle", () => {
  const input = baseInput();
  input.model.apparentTemperatureAvailable = false;
  input.model.todayRangeMode = "fallback";
  input.model.nextHoursMode = "fallback";
  input.model.nextChangeMode = "fallback";
  const provenance = buildEssentialProvenance(input);
  assert.equal(provenance.values.apparentTemperature.nature, "fallback");
  assert.deepEqual(provenance.values.apparentTemperature.derivedFrom, ["currentTemperature"]);
  assert.equal(provenance.values.todayRange.status, "partial");
  assert.equal(provenance.values.nextHours.source, null);
  assert.equal(provenance.values.nextChange.nature, "fallback");
});
