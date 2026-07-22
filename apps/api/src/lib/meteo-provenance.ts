import type { ResolvedGeography } from "./geography.js";
import type {
  StationSelectionDecision,
  SelectedStationObservation,
} from "./station-observations.js";

export type WeatherMode = "model" | "observation" | "hybrid" | "unavailable";
export type ProvenanceStatus = "available" | "partial" | "unavailable";
export type ProvenanceNature =
  | "observation"
  | "model"
  | "official"
  | "geographic"
  | "derived"
  | "fallback"
  | "unavailable";

export type ProvenanceValueKey =
  | "municipality"
  | "department"
  | "altitude"
  | "currentTemperature"
  | "apparentTemperature"
  | "weatherCondition"
  | "todayRange"
  | "nextChange"
  | "nextHours"
  | "alert";

export interface ProvenanceSource {
  id: string;
  name: string;
  provider: string | null;
  product: string | null;
  model: string | null;
  url: string | null;
  license: string | null;
}

export interface ProvenanceTime {
  observedAt: string | null;
  validAt: string | null;
  generatedAt: string | null;
  retrievedAt: string | null;
}

export interface ProvenanceModelPoint {
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
}

export interface ProvenanceQuality {
  stale: boolean;
  ageMinutes: number | null;
  spatialResolution: string | null;
  modelPoint: ProvenanceModelPoint | null;
}

export interface ProvenanceStation {
  id: string;
  name: string;
  network: "meteofrance" | "infoclimat";
  altitudeM: number;
  distanceKm: number;
  altitudeDifferenceM: number | null;
  ageMinutes: number;
  selectionScore: number;
  license: string | null;
}

export interface ValueProvenance {
  status: ProvenanceStatus;
  nature: ProvenanceNature;
  label: string;
  source: ProvenanceSource | null;
  time: ProvenanceTime;
  quality: ProvenanceQuality;
  station: ProvenanceStation | null;
  derivedFrom: ProvenanceValueKey[];
  notes: string[];
}

export interface PublicStationSelection {
  policyVersion: "1";
  status:
    | "selected"
    | "no_measurements"
    | "no_eligible_station"
    | "provider_unavailable"
    | "not_evaluated";
  reasonCode:
    | "BEST_ELIGIBLE_STATION"
    | "NO_VALID_MEASUREMENTS"
    | "NO_ELIGIBLE_STATION"
    | "STATION_DATA_UNAVAILABLE"
    | "SELECTION_NOT_RUN";
  evaluatedCandidates: number | null;
  eligibleCandidates: number | null;
  selectedStationId: string | null;
}

export interface WeatherProvenance {
  schemaVersion: "1.0";
  weatherMode: WeatherMode;
  summary: string;
  values: Record<ProvenanceValueKey, ValueProvenance>;
  stationSelection: PublicStationSelection;
}

export type ProvenanceComputationMode = "model" | "derived" | "fallback";

export interface EssentialProvenanceBuildInput {
  retrievedAt: string;
  geography: ResolvedGeography;
  observationProviderUnavailable: boolean;
  stationDecision: StationSelectionDecision | null;
  model: {
    currentTemperatureAvailable: boolean;
    apparentTemperatureAvailable: boolean;
    weatherConditionAvailable: boolean;
    validAt: string | null;
    point: ProvenanceModelPoint;
    todayRangeMode: ProvenanceComputationMode;
    todayRangeValidAt: string | null;
    nextChangeMode: "derived" | "fallback";
    nextChangeValidAt: string | null;
    nextHoursMode: "model" | "fallback";
    nextHoursValidAt: string | null;
  };
  alert: {
    available: boolean;
    generatedAt: string | null;
    validAt: string | null;
  };
}

const IGN_GEOCODING: ProvenanceSource = {
  id: "ign-geocodage",
  name: "Géoplateforme IGN",
  provider: "IGN",
  product: "Géocodage inverse",
  model: null,
  url: "https://data.geopf.fr/",
  license: null,
};

const IGN_ALTIMETRY: ProvenanceSource = {
  id: "ign-altimetrie",
  name: "Géoplateforme IGN",
  provider: "IGN",
  product: "RGE ALTI",
  model: null,
  url: "https://data.geopf.fr/",
  license: null,
};

const METEO_MODEL: ProvenanceSource = {
  id: "open-meteo-meteofrance",
  name: "Open-Meteo",
  provider: "Open-Meteo",
  product: "Météo-France seamless",
  model: "AROME / ARPEGE",
  url: "https://open-meteo.com/",
  license: null,
};

const OPENDATAVAL_DERIVED: ProvenanceSource = {
  id: "opendataval-derived",
  name: "OpenDataVal",
  provider: "OpenDataVal",
  product: "Calcul de présentation",
  model: null,
  url: null,
  license: null,
};

const METEOFRANCE_VIGILANCE: ProvenanceSource = {
  id: "meteofrance-vigilance",
  name: "Vigilance Météo-France",
  provider: "Météo-France",
  product: "DPVigilance",
  model: null,
  url: "https://vigilance.meteofrance.fr/fr",
  license: "Licence Ouverte 2.0",
};

function time(
  retrievedAt: string,
  overrides: Partial<Omit<ProvenanceTime, "retrievedAt">> = {},
): ProvenanceTime {
  return {
    observedAt: null,
    validAt: null,
    generatedAt: null,
    retrievedAt,
    ...overrides,
  };
}

function quality(overrides: Partial<ProvenanceQuality> = {}): ProvenanceQuality {
  return {
    stale: false,
    ageMinutes: null,
    spatialResolution: null,
    modelPoint: null,
    ...overrides,
  };
}

function unavailableValue(
  label: string,
  retrievedAt: string,
  note: string,
): ValueProvenance {
  return {
    status: "unavailable",
    nature: "unavailable",
    label,
    source: null,
    time: time(retrievedAt),
    quality: quality(),
    station: null,
    derivedFrom: [],
    notes: [note],
  };
}

function geographicValue(
  available: boolean,
  label: string,
  unavailableLabel: string,
  source: ProvenanceSource,
  retrievedAt: string,
  unavailableNote: string,
): ValueProvenance {
  if (!available) return unavailableValue(unavailableLabel, retrievedAt, unavailableNote);
  return {
    status: "available",
    nature: "geographic",
    label,
    source,
    time: time(retrievedAt),
    quality: quality(),
    station: null,
    derivedFrom: [],
    notes: [],
  };
}

function modelValue(
  label: string,
  retrievedAt: string,
  validAt: string | null,
  modelPoint: ProvenanceModelPoint,
): ValueProvenance {
  return {
    status: "available",
    nature: "model",
    label,
    source: METEO_MODEL,
    time: time(retrievedAt, { validAt }),
    quality: quality({
      spatialResolution: "1,5 à 2,5 km",
      modelPoint,
    }),
    station: null,
    derivedFrom: [],
    notes: [],
  };
}

function stationSource(observation: SelectedStationObservation): ProvenanceSource {
  if (observation.station.reseau === "infoclimat") {
    return {
      id: "infoclimat-static",
      name: "Infoclimat StatIC",
      provider: "Infoclimat",
      product: "Réseau StatIC",
      model: null,
      url: "https://www.infoclimat.fr/",
      license: observation.station.licence,
    };
  }
  return {
    id: "meteofrance-dpobs",
    name: "Observations Météo-France",
    provider: "Météo-France",
    product: "DPObs",
    model: null,
    url: "https://donneespubliques.meteofrance.fr/",
    license: observation.station.licence,
  };
}

function observationValue(
  observation: SelectedStationObservation,
  retrievedAt: string,
): ValueProvenance {
  return {
    status: "available",
    nature: "observation",
    label: "Mesure locale",
    source: stationSource(observation),
    time: time(retrievedAt, { observedAt: observation.observedAt }),
    quality: quality({
      stale: observation.stale,
      ageMinutes: observation.ageMinutes,
    }),
    station: {
      id: observation.station.id,
      name: observation.station.nom,
      network: observation.station.reseau,
      altitudeM: observation.station.altitudeM,
      distanceKm: observation.distanceKm,
      altitudeDifferenceM: observation.altitudeDifferenceM,
      ageMinutes: observation.ageMinutes,
      selectionScore: observation.selectionScore,
      license: observation.station.licence,
    },
    derivedFrom: [],
    notes: [],
  };
}

function fallbackValue(
  label: string,
  retrievedAt: string,
  derivedFrom: ProvenanceValueKey[],
  note: string,
  validAt: string | null = null,
): ValueProvenance {
  return {
    status: "partial",
    nature: "fallback",
    label,
    source: null,
    time: time(retrievedAt, { validAt }),
    quality: quality(),
    station: null,
    derivedFrom,
    notes: [note],
  };
}

function derivedValue(
  label: string,
  retrievedAt: string,
  derivedFrom: ProvenanceValueKey[],
  validAt: string | null,
  note: string | null = null,
): ValueProvenance {
  return {
    status: "available",
    nature: "derived",
    label,
    source: OPENDATAVAL_DERIVED,
    time: time(retrievedAt, { validAt }),
    quality: quality(),
    station: null,
    derivedFrom,
    notes: note ? [note] : [],
  };
}

function publicStationSelection(input: EssentialProvenanceBuildInput): PublicStationSelection {
  if (input.observationProviderUnavailable) {
    return {
      policyVersion: "1",
      status: "provider_unavailable",
      reasonCode: "STATION_DATA_UNAVAILABLE",
      evaluatedCandidates: null,
      eligibleCandidates: null,
      selectedStationId: null,
    };
  }

  const decision = input.stationDecision;
  if (!decision) {
    return {
      policyVersion: "1",
      status: "not_evaluated",
      reasonCode: "SELECTION_NOT_RUN",
      evaluatedCandidates: null,
      eligibleCandidates: null,
      selectedStationId: null,
    };
  }

  return {
    policyVersion: decision.policyVersion,
    status: decision.status,
    reasonCode: decision.reasonCode,
    evaluatedCandidates: decision.evaluatedCandidates,
    eligibleCandidates: decision.eligibleCandidates,
    selectedStationId: decision.selectedStationId,
  };
}

function weatherMode(input: EssentialProvenanceBuildInput): WeatherMode {
  if (input.stationDecision?.selected) {
    return input.model.apparentTemperatureAvailable || input.model.weatherConditionAvailable
      ? "hybrid"
      : "observation";
  }
  return input.model.currentTemperatureAvailable ? "model" : "unavailable";
}

function summary(input: EssentialProvenanceBuildInput, mode: WeatherMode): string {
  if (mode === "hybrid") {
    return "Température mesurée localement ; ressenti, état du ciel et prévisions modélisés.";
  }
  if (mode === "observation") {
    return "Conditions actuelles issues d’une observation locale.";
  }
  if (mode === "unavailable") {
    return "Aucune condition météo actuelle exploitable.";
  }
  if (input.observationProviderUnavailable) {
    return "Conditions modélisées ; les observations locales sont momentanément indisponibles.";
  }
  if (input.stationDecision?.status === "no_eligible_station") {
    return "Conditions et prévisions modélisées ; aucune station suffisamment représentative.";
  }
  return "Conditions et prévisions modélisées ; aucune observation locale exploitable.";
}

export function buildEssentialProvenance(
  input: EssentialProvenanceBuildInput,
): WeatherProvenance {
  const selectedObservation = input.stationDecision?.selected ?? null;
  const mode = weatherMode(input);
  const modelPoint = input.model.point;

  const currentTemperature = selectedObservation
    ? observationValue(selectedObservation, input.retrievedAt)
    : input.model.currentTemperatureAvailable
      ? modelValue("Prévision modélisée", input.retrievedAt, input.model.validAt, modelPoint)
      : unavailableValue(
        "Température non disponible",
        input.retrievedAt,
        "Ni observation locale ni température modélisée exploitable.",
      );

  const apparentTemperature = input.model.apparentTemperatureAvailable
    ? modelValue("Ressenti modélisé", input.retrievedAt, input.model.validAt, modelPoint)
    : fallbackValue(
      "Ressenti remplacé par la température",
      input.retrievedAt,
      ["currentTemperature"],
      "Le modèle ne fournit pas de température ressentie exploitable.",
      input.model.validAt,
    );

  const weatherCondition = input.model.weatherConditionAvailable
    ? modelValue("Condition modélisée", input.retrievedAt, input.model.validAt, modelPoint)
    : unavailableValue(
      "Condition météo non disponible",
      input.retrievedAt,
      "Aucun code météorologique exploitable n’a été fourni.",
    );

  const todayRange = input.model.todayRangeMode === "model"
    ? modelValue(
      "Minimum et maximum modélisés",
      input.retrievedAt,
      input.model.todayRangeValidAt,
      modelPoint,
    )
    : input.model.todayRangeMode === "derived"
      ? derivedValue(
        "Minimum et maximum ajustés",
        input.retrievedAt,
        ["currentTemperature"],
        input.model.todayRangeValidAt,
        "La température courante élargit la plage quotidienne fournie par le modèle.",
      )
      : fallbackValue(
        "Minimum et maximum de repli",
        input.retrievedAt,
        ["currentTemperature"],
        "La plage quotidienne du modèle est incomplète.",
        input.model.todayRangeValidAt,
      );

  const nextHours = input.model.nextHoursMode === "model"
    ? modelValue(
      "Prévisions horaires modélisées",
      input.retrievedAt,
      input.model.nextHoursValidAt,
      modelPoint,
    )
    : fallbackValue(
      "Prévision horaire de repli",
      input.retrievedAt,
      ["currentTemperature"],
      "La série horaire du modèle est vide ; un point minimal a été construit.",
      input.model.nextHoursValidAt,
    );

  const nextChange = input.model.nextChangeMode === "derived"
    ? derivedValue(
      "Changement calculé par OpenDataVal",
      input.retrievedAt,
      ["nextHours"],
      input.model.nextChangeValidAt,
    )
    : fallbackValue(
      "Tendance de repli",
      input.retrievedAt,
      ["nextHours"],
      "La série horaire est insuffisante pour établir un changement fiable.",
      input.model.nextChangeValidAt,
    );

  const alert = input.alert.available
    ? {
      status: "available" as const,
      nature: "official" as const,
      label: "Vigilance officielle Météo-France",
      source: METEOFRANCE_VIGILANCE,
      time: time(input.retrievedAt, {
        generatedAt: input.alert.generatedAt,
        validAt: input.alert.validAt,
      }),
      quality: quality(),
      station: null,
      derivedFrom: [],
      notes: input.alert.validAt === null
        ? ["La période de validité officielle n’est pas encore exposée par cet adaptateur."]
        : [],
    }
    : unavailableValue(
      "Vigilance non établie",
      input.retrievedAt,
      input.geography.department === null
        ? "La vigilance ne peut pas être déterminée sans département."
        : "Le produit officiel de vigilance n’a pas pu être établi.",
    );

  return {
    schemaVersion: "1.0",
    weatherMode: mode,
    summary: summary(input, mode),
    values: {
      municipality: geographicValue(
        input.geography.municipality !== null,
        "Commune issue de l’IGN",
        "Commune non disponible",
        IGN_GEOCODING,
        input.retrievedAt,
        "Le géocodage IGN n’a pas répondu.",
      ),
      department: geographicValue(
        input.geography.department !== null,
        "Département issu de l’IGN",
        "Département non disponible",
        IGN_GEOCODING,
        input.retrievedAt,
        "Aucun département de repli n’est utilisé.",
      ),
      altitude: geographicValue(
        input.geography.altitudeM !== null,
        "Altitude issue de l’IGN",
        "Altitude non disponible",
        IGN_ALTIMETRY,
        input.retrievedAt,
        "L’altimétrie IGN n’a pas répondu.",
      ),
      currentTemperature,
      apparentTemperature,
      weatherCondition,
      todayRange,
      nextChange,
      nextHours,
      alert,
    },
    stationSelection: publicStationSelection(input),
  };
}
