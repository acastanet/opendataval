import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SPHERES,
  type DonneeDalle,
  type DonneesParSphere,
  type ManifesteDalle,
  type SceneDalle,
  type Sphere,
} from "@opendata-vda/shared/dalle";
import type { EmpriseDalle } from "@opendata-vda/shared/dalle-geometrie";

/**
 * Version du contrat de manifeste (`agent/mvp/schemas/tile-manifest.schema.json`), pas du
 * pipeline de fabrication — voir `pipelineVersion` sur chaque manifeste pour ce dernier.
 */
export const VERSION_SCHEMA_MANIFESTE = "1.0.0";

/** Version du pipeline M1 : raccord provisoire à une scène déjà produite (`05-M1-VERTICAL-SLICE.md`). */
export const VERSION_PIPELINE = "0.1.0-m1";

const NOM_FICHIER_MANIFESTE = "manifest.json";

/** Construit le manifeste initial d'une dalle tout juste créée, avant toute collecte. */
export function construireManifesteInitial(tileId: string, emprise: EmpriseDalle, title: string | null): ManifesteDalle {
  return {
    schemaVersion: VERSION_SCHEMA_MANIFESTE,
    identity: {
      tileId,
      title,
      center: emprise.center,
      widthM: emprise.widthM,
      heightM: emprise.heightM,
      areaM2: emprise.areaM2,
      geometryWgs84: emprise.geometryWgs84,
      geometryProjected: emprise.geometryProjected,
      address: null,
    },
    production: {
      createdAt: new Date().toISOString(),
      pipelineVersion: VERSION_PIPELINE,
    },
    status: "created",
    data: {},
    review: { status: "not_started", reviewedAt: null, reviewedBy: null, notes: null },
  };
}

function donneeVersJson(d: DonneeDalle): Record<string, unknown> {
  return {
    key: d.key,
    value: d.value,
    unit: d.unit,
    sphere: d.sphere,
    spatial_relation: d.spatialRelation,
    distance_m: d.distanceM,
    source: {
      producer: d.source.producer,
      dataset: d.source.dataset,
      url: d.source.url,
      license: d.source.license,
    },
    time: {
      observed_at: d.time.observedAt,
      retrieved_at: d.time.retrievedAt,
      reference_period: d.time.referencePeriod,
    },
    ...(d.resolution ? { resolution: { spatial_m: d.resolution.spatialM } } : {}),
    ...(d.selection
      ? {
          selection: {
            method: d.selection.method,
            automatic_choice: d.selection.automaticChoice ?? null,
            human_choice: d.selection.humanChoice ?? null,
            review_reason: d.selection.reviewReason,
          },
        }
      : {}),
    status: {
      availability: d.status.availability,
      freshness: d.status.freshness,
      review: d.status.review,
    },
  };
}

function donneeDepuisJson(json: Record<string, unknown>): DonneeDalle {
  const source = json.source as Record<string, unknown>;
  const time = json.time as Record<string, unknown>;
  const statut = json.status as Record<string, unknown>;
  const resolution = json.resolution as Record<string, unknown> | undefined;
  const selection = json.selection as Record<string, unknown> | undefined;
  return {
    key: String(json.key),
    value: json.value,
    unit: (json.unit as string | null) ?? null,
    sphere: json.sphere as DonneeDalle["sphere"],
    spatialRelation: json.spatial_relation as DonneeDalle["spatialRelation"],
    distanceM: (json.distance_m as number | null) ?? null,
    source: {
      producer: String(source.producer),
      dataset: String(source.dataset),
      url: (source.url as string | null) ?? null,
      license: (source.license as string | null) ?? null,
    },
    time: {
      observedAt: (time.observed_at as string | null) ?? null,
      retrievedAt: String(time.retrieved_at),
      referencePeriod: (time.reference_period as string | null) ?? null,
    },
    ...(resolution ? { resolution: { spatialM: (resolution.spatial_m as number | null) ?? null } } : {}),
    ...(selection
      ? {
          selection: {
            method: (selection.method as string | null) ?? null,
            automaticChoice: selection.automatic_choice,
            humanChoice: selection.human_choice,
            reviewReason: (selection.review_reason as string | null) ?? null,
          },
        }
      : {}),
    status: {
      availability: statut.availability as DonneeDalle["status"]["availability"],
      freshness: (statut.freshness as string | null) ?? null,
      review: (statut.review as string | null) ?? null,
    },
  };
}

function sceneVersJson(scene: SceneDalle): Record<string, unknown> {
  return {
    glb: scene.glb,
    terrain: scene.terrain,
    orthophoto: scene.orthophoto,
    ...(scene.metadata !== undefined ? { metadata: scene.metadata } : {}),
    ...(scene.sourcePoints !== undefined
      ? {
          source_points: scene.sourcePoints
            ? { glb: scene.sourcePoints.glb, metadata: scene.sourcePoints.metadata }
            : null,
        }
      : {}),
    ...(scene.orthophotoCalage !== undefined
      ? {
          orthophoto_calage: scene.orthophotoCalage
            ? { est_m: scene.orthophotoCalage.estM, nord_m: scene.orthophotoCalage.nordM }
            : null,
        }
      : {}),
  };
}

function sceneDepuisJson(json: Record<string, unknown>): SceneDalle {
  const sourcePoints = json.source_points as Record<string, unknown> | null | undefined;
  const orthophotoCalage = json.orthophoto_calage as Record<string, unknown> | null | undefined;
  return {
    glb: (json.glb as string | null) ?? null,
    terrain: (json.terrain as string | null) ?? null,
    orthophoto: (json.orthophoto as string | null) ?? null,
    ...(Object.hasOwn(json, "metadata") ? { metadata: (json.metadata as string | null) ?? null } : {}),
    ...(Object.hasOwn(json, "source_points")
      ? {
          sourcePoints: sourcePoints
            ? { glb: String(sourcePoints.glb), metadata: (sourcePoints.metadata as string | null) ?? null }
            : null,
        }
      : {}),
    ...(Object.hasOwn(json, "orthophoto_calage")
      ? {
          orthophotoCalage: orthophotoCalage
            ? { estM: Number(orthophotoCalage.est_m), nordM: Number(orthophotoCalage.nord_m) }
            : null,
        }
      : {}),
  };
}

/**
 * Sérialise un manifeste vers la forme snake_case du fichier `manifest.json`, conforme à
 * `agent/mvp/schemas/tile-manifest.schema.json`. Les types TypeScript de `dalle.ts` restent
 * en camelCase par convention du dépôt ; cette conversion est le point unique qui les relie
 * au contrat de fichier (voir l'en-tête de `dalle.ts`).
 *
 * Les blocs structurels absents (`scene`, `quality`, `provenance`, `production.dataVersions`,
 * `identity.geometryProjected`, `donnee.resolution`/`selection`) sont omis par étalement
 * conditionnel plutôt qu'assignés à `undefined` : une clé JS valant explicitement `undefined`
 * reste une clé présente pour `deepStrictEqual`, ce que `JSON.stringify` masque sur disque
 * mais qu'un test en mémoire démasque aussitôt.
 */
export function versManifesteJson(m: ManifesteDalle): Record<string, unknown> {
  const data: Record<string, unknown[]> = {};
  for (const sphere of SPHERES) {
    const donnees = m.data[sphere];
    if (donnees && donnees.length > 0) data[sphere] = donnees.map(donneeVersJson);
  }

  return {
    schema_version: m.schemaVersion,
    identity: {
      tile_id: m.identity.tileId,
      title: m.identity.title,
      center: m.identity.center,
      width_m: m.identity.widthM,
      height_m: m.identity.heightM,
      area_m2: m.identity.areaM2,
      geometry_wgs84: m.identity.geometryWgs84,
      ...(m.identity.geometryProjected ? { geometry_projected: m.identity.geometryProjected } : {}),
      address: m.identity.address,
    },
    production: {
      created_at: m.production.createdAt,
      pipeline_version: m.production.pipelineVersion,
      ...(m.production.dataVersions ? { data_versions: m.production.dataVersions } : {}),
    },
    status: m.status,
    ...(m.scene ? { scene: sceneVersJson(m.scene) } : {}),
    data,
    ...(m.quality ? { quality: m.quality } : {}),
    ...(m.provenance ? { provenance: m.provenance } : {}),
    review: {
      status: m.review.status,
      reviewed_at: m.review.reviewedAt,
      reviewed_by: m.review.reviewedBy,
      notes: m.review.notes,
    },
  };
}

/** Relit un `manifest.json` vers le type interne `ManifesteDalle`. Inverse de `versManifesteJson`. */
export function depuisManifesteJson(json: Record<string, unknown>): ManifesteDalle {
  const identity = json.identity as Record<string, unknown>;
  const production = json.production as Record<string, unknown>;
  const review = json.review as Record<string, unknown>;
  const jsonData = (json.data ?? {}) as Record<string, unknown[]>;

  const data: DonneesParSphere = {};
  for (const sphere of SPHERES as readonly Sphere[]) {
    const donnees = jsonData[sphere];
    if (Array.isArray(donnees) && donnees.length > 0) {
      data[sphere] = donnees.map((d) => donneeDepuisJson(d as Record<string, unknown>));
    }
  }

  const dataVersions = production.data_versions as Record<string, string> | undefined;
  const geometryProjected = identity.geometry_projected as ManifesteDalle["identity"]["geometryProjected"];
  const sceneJson = json.scene as Record<string, unknown> | undefined;
  const quality = json.quality as Record<string, unknown> | undefined;
  const provenance = json.provenance as unknown[] | undefined;

  return {
    schemaVersion: String(json.schema_version),
    identity: {
      tileId: String(identity.tile_id),
      title: (identity.title as string | null) ?? null,
      center: identity.center as ManifesteDalle["identity"]["center"],
      widthM: identity.width_m as 200,
      heightM: identity.height_m as 200,
      areaM2: Number(identity.area_m2),
      geometryWgs84: identity.geometry_wgs84 as ManifesteDalle["identity"]["geometryWgs84"],
      ...(geometryProjected ? { geometryProjected } : {}),
      address: (identity.address as string | null) ?? null,
    },
    production: {
      createdAt: String(production.created_at),
      pipelineVersion: String(production.pipeline_version),
      ...(dataVersions ? { dataVersions } : {}),
    },
    status: json.status as ManifesteDalle["status"],
    ...(sceneJson ? { scene: sceneDepuisJson(sceneJson) } : {}),
    data,
    ...(quality ? { quality } : {}),
    ...(provenance ? { provenance } : {}),
    review: {
      status: review.status as ManifesteDalle["review"]["status"],
      reviewedAt: (review.reviewed_at as string | null) ?? null,
      reviewedBy: (review.reviewed_by as string | null) ?? null,
      notes: (review.notes as string | null) ?? null,
    },
  };
}

function cheminManifeste(instanceDir: string): string {
  return join(instanceDir, NOM_FICHIER_MANIFESTE);
}

/**
 * Écrit le manifeste sur un fichier temporaire puis le bascule par `rename`, pour qu'un
 * lecteur ne voie jamais un `manifest.json` à moitié écrit (même motif que
 * `apps/association-service/src/store.ts`).
 */
export async function ecrireManifesteAtomique(instanceDir: string, manifeste: ManifesteDalle): Promise<void> {
  await mkdir(instanceDir, { recursive: true });
  const chemin = cheminManifeste(instanceDir);
  const temporaire = `${chemin}.tmp`;
  await writeFile(temporaire, JSON.stringify(versManifesteJson(manifeste), null, 2));
  await rename(temporaire, chemin);
}

/** Relit le manifeste d'une instance. `null` si l'instance n'existe pas encore sur disque. */
export async function lireManifeste(instanceDir: string): Promise<ManifesteDalle | null> {
  try {
    const contenu = await readFile(cheminManifeste(instanceDir), "utf-8");
    return depuisManifesteJson(JSON.parse(contenu));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function repertoireInstance(instancesDir: string, tileId: string): string {
  return join(instancesDir, tileId);
}
