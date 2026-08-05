import type { Feature, FeatureCollection, GeoJsonProperties, Point } from "geojson";
import type { OldConfig } from "./config.js";
import {
  bufferSurface,
  intersectSurfaces,
  normalizeSurface,
  pointFeature,
  selectBuilding,
  surfaceContains,
  surfaceAreaSquareMeters,
  surfaceFeature,
  unionSurfaces,
} from "./geometry.js";
import type {
  GeoFeatureCollection,
  OldAnalysisInput,
  OldSourceClients,
  SourceState,
  SurfaceFeature,
  SurfaceGeometry,
} from "./types.js";

type FeatureCollectionState = SourceState<FeatureCollection>;

async function sourceState(operation: () => Promise<FeatureCollection>): Promise<FeatureCollectionState> {
  try {
    return { status: "available", data: await operation(), message: null };
  } catch (error) {
    return {
      status: "unavailable",
      data: null,
      message: error instanceof Error ? error.message : "Source indisponible.",
    };
  }
}

function firstSurface(collection: FeatureCollection | null): SurfaceFeature | null {
  if (!collection) return null;
  for (const feature of collection.features) {
    const geometry = normalizeSurface(feature.geometry);
    if (geometry) {
      return {
        type: "Feature",
        id: feature.id,
        geometry,
        properties: feature.properties ?? {},
      };
    }
  }
  return null;
}

function propertyString(properties: GeoJsonProperties, name: string): string | null {
  const value = properties?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function urbanZoneType(feature: Feature): string | null {
  return propertyString(feature.properties, "typezone")
    ?? propertyString(feature.properties, "libelle");
}

function isUrbanZone(feature: Feature): boolean {
  return urbanZoneType(feature)?.toUpperCase().startsWith("U") === true;
}

function sourceSummary(state: FeatureCollectionState): { status: string; message: string | null } {
  return { status: state.status, message: state.message };
}

function applicabilitySummary(state: FeatureCollectionState) {
  if (!state.data) {
    return {
      status: state.status,
      applicable: null,
      zones: [],
      message: state.message,
    };
  }
  const zones = [...new Set(state.data.features.flatMap((feature) => {
    const value = feature.properties?.zonage;
    return typeof value === "number" || typeof value === "string" ? [Number(value)] : [];
  }).filter(Number.isFinite))].sort((a, b) => a - b);
  return {
    status: state.status,
    applicable: state.data.features.length > 0,
    zones,
    message: null,
    objects: state.data.features.map((feature) => ({
      id: feature.properties?.id ?? feature.id ?? null,
      zone: feature.properties?.zonage ?? null,
      source: feature.properties?.source ?? null,
      millesime: feature.properties?.millesime ?? null,
      dateArrete: feature.properties?.dat_ap_old ?? null,
      referenceUrl: feature.properties?.url ?? null,
    })),
  };
}

function urbanismSummary(state: FeatureCollectionState) {
  const features = state.data?.features ?? [];
  return {
    status: state.status,
    message: state.message,
    zones: features.map((feature) => ({
      type: urbanZoneType(feature),
      label: propertyString(feature.properties, "libelong"),
      documentId: propertyString(feature.properties, "idurba"),
      validAt: propertyString(feature.properties, "datvalid"),
      regulationUrl: propertyString(feature.properties, "urlfic"),
      urban: isUrbanZone(feature),
    })),
  };
}

function outputFeature(
  feature: SurfaceFeature,
  properties: GeoJsonProperties,
): SurfaceFeature {
  return {
    type: "Feature",
    id: feature.id,
    geometry: feature.geometry,
    properties,
  };
}

function cadastralProperties(parcel: SurfaceFeature | null): Record<string, unknown> | null {
  if (!parcel) return null;
  return {
    id: parcel.properties?.idu ?? parcel.id ?? null,
    section: parcel.properties?.section ?? null,
    numero: parcel.properties?.numero ?? null,
    codeInsee: parcel.properties?.code_insee ?? null,
    commune: parcel.properties?.nom_com ?? null,
    contenanceM2: parcel.properties?.contenance ?? null,
  };
}

export interface OldAnalysisOptions {
  input: OldAnalysisInput;
  clients: OldSourceClients;
  config: OldConfig;
  now?: () => Date;
}

export async function analyzeOld(options: OldAnalysisOptions) {
  const { lon, lat, distanceMeters } = options.input;
  const [buildingsState, parcelState, applicabilityState] = await Promise.all([
    sourceState(() => options.clients.buildings(lon, lat)),
    sourceState(() => options.clients.parcel(lon, lat)),
    sourceState(() => options.clients.applicability(lon, lat)),
  ]);
  const parcel = firstSurface(parcelState.data);
  const urbanismState = await sourceState(() => options.clients.urbanism(
    parcel?.geometry ?? { type: "Point", coordinates: [lon, lat] },
  ));

  const warnings: string[] = [];
  const building = buildingsState.data
    ? selectBuilding(
        buildingsState.data,
        lon,
        lat,
        Math.min(options.config.buildingSearchRadiusMeters, 30),
      )
    : null;
  const buildingContainsPoint = building
    ? surfaceContains(building.geometry, lon, lat)
    : false;

  const origin: SurfaceFeature | Feature<Point> = building
    ? outputFeature(building, {
        source: "IGN BD TOPO",
        sourceId: building.id ?? building.properties?.cleabs ?? null,
        nature: building.properties?.nature ?? null,
        usage: building.properties?.usage_1 ?? null,
      })
    : pointFeature(lon, lat, { source: "coordonnée fournie" });

  if (!building) {
    warnings.push(
      "Aucune emprise de bâtiment n’a été identifiée avec assez de confiance : le périmètre est un cercle provisoire autour du point.",
    );
  } else if (!buildingContainsPoint) {
    warnings.push(
      "Le point n’est pas dans l’emprise : le bâtiment le plus proche à moins de 30 m a été retenu et doit être confirmé sur la carte.",
    );
  }

  let calculated = bufferSurface(origin, distanceMeters);
  let method = building ? "buffer_batiment" : "buffer_point_provisoire";

  const urbanPortions: SurfaceFeature[] = [];
  if (parcel && urbanismState.data) {
    for (const feature of urbanismState.data.features.filter(isUrbanZone)) {
      const geometry = normalizeSurface(feature.geometry);
      if (!geometry) continue;
      const portion = intersectSurfaces(parcel, surfaceFeature(geometry));
      if (portion) urbanPortions.push(portion);
    }
  }
  if (urbanPortions.length) {
    try {
      calculated = unionSurfaces([calculated, ...urbanPortions]);
      method += "_et_partie_parcelle_zone_u";
    } catch {
      warnings.push(
        "La partie cadastrale située en zone U n’a pas pu être fusionnée au tampon ; vérifiez-la séparément.",
      );
    }
  }

  if (parcelState.status === "unavailable") {
    warnings.push("La parcelle cadastrale n’a pas pu être vérifiée.");
  }
  if (urbanismState.status === "unavailable") {
    warnings.push("Le zonage du document d’urbanisme n’a pas pu être vérifié.");
  }
  if (applicabilityState.status === "unavailable") {
    warnings.push("Le zonage national d’applicabilité OLD n’a pas pu être vérifié.");
  }
  warnings.push(
    "La voie privée d’accès n’est pas incluse : sa géométrie et la profondeur fixée par l’arrêté préfectoral doivent être vérifiées sur place.",
  );

  const surfaceM2 = surfaceAreaSquareMeters(calculated);
  const generatedAt = (options.now?.() ?? new Date()).toISOString();
  const perimeter = outputFeature(calculated, {
    layer: "old-perimetre-calcule",
    status: building ? "indicatif" : "provisoire",
    method,
    distanceM: distanceMeters,
    surfaceM2,
    generatedAt,
    precision: "indicative",
  });

  const features: GeoFeatureCollection["features"] = [perimeter];
  if (building) features.push(outputFeature(building, {
    layer: "old-batiment-source",
    source: "IGN BD TOPO",
    sourceId: building.id ?? null,
    nature: building.properties?.nature ?? null,
    usage: building.properties?.usage_1 ?? null,
  }));
  if (parcel) features.push(outputFeature(parcel, {
    layer: "old-parcelle",
    source: "API Carto Cadastre / Parcellaire Express",
    ...cadastralProperties(parcel),
  }));
  features.push(pointFeature(lon, lat, { layer: "old-point-analyse" }));

  return {
    status: building ? "indicatif" : "provisoire",
    applicable: applicabilitySummary(applicabilityState).applicable,
    query: { lon, lat, distanceM: distanceMeters },
    calculation: {
      method,
      basedOnBuilding: Boolean(building),
      includesPrivateAccess: false,
      includesUrbanParcelPortion: urbanPortions.length > 0,
      surfaceM2,
      generatedAt,
    },
    applicability: applicabilitySummary(applicabilityState),
    parcel: {
      ...sourceSummary(parcelState),
      data: cadastralProperties(parcel),
    },
    urbanism: urbanismSummary(urbanismState),
    building: {
      ...sourceSummary(buildingsState),
      selected: building ? {
        id: building.id ?? null,
        nature: building.properties?.nature ?? null,
        usage: building.properties?.usage_1 ?? null,
      } : null,
    },
    sources: {
      building: "IGN BD TOPO — WFS Géoplateforme",
      parcel: "API Carto Cadastre — Parcellaire Express",
      urbanism: "API Carto — Géoportail de l’urbanisme",
      applicability: "IGN DÉBROUSSAILLEMENT — WFS Géoplateforme",
    },
    warnings,
    geojson: { type: "FeatureCollection", features } satisfies GeoFeatureCollection,
  };
}
