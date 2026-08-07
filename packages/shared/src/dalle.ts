/**
 * Contrats partagés de la dalle OpenDataVdA (MVP), miroir de
 * `agent/mvp/02-TILE-CONTRACT.md`, `03-DATA-CONTRACT.md` et
 * `schemas/tile-manifest.schema.json`. Toute modification de ces enums ou
 * types doit être répercutée dans le schéma JSON — voir `07-AGENT-RULES.md` § 5.
 *
 * Les types ci-dessous sont en camelCase, par convention TypeScript du dépôt
 * (`AGENTS.md`). Le fichier `manifest.json` réellement écrit sur disque suit le
 * schéma JSON, en snake_case : la (dé)sérialisation entre les deux revient à
 * `site-service` (lot P2/P3 du backlog), pas à ce module de contrats.
 */

/** Cycle de vie de fabrication d'une instance. Distinct de la revue humaine, voir `StatutRevue`. */
export const ETATS_DALLE = ["created", "collecting", "generated", "review_required", "approved", "published", "failed"] as const;
export type EtatDalle = typeof ETATS_DALLE[number];

/**
 * Transitions autorisées entre états de fabrication. `review_required → collecting` est le
 * seul retour possible : il correspond à une correction demandée par l'opérateur
 * (`StatutRevue` = `changes_requested`), pas à un nouvel échec de fabrication.
 */
export const TRANSITIONS_AUTORISEES: Readonly<Record<EtatDalle, readonly EtatDalle[]>> = {
  created: ["collecting"],
  collecting: ["generated", "failed"],
  generated: ["review_required"],
  review_required: ["approved", "collecting"],
  approved: ["published"],
  published: [],
  failed: [],
};

export function transitionAutorisee(depuis: EtatDalle, vers: EtatDalle): boolean {
  return TRANSITIONS_AUTORISEES[depuis].includes(vers);
}

/** Décision humaine de supervision, séparée du cycle de fabrication (`EtatDalle`). */
export const STATUTS_REVUE = ["not_started", "pending", "approved", "changes_requested"] as const;
export type StatutRevue = typeof STATUTS_REVUE[number];

/**
 * Valide une transition en tenant compte de la revue humaine, pas seulement du graphe
 * d'états. `02-TILE-CONTRACT.md` pose l'invariant « une instance publiée doit avoir été
 * approuvée » : l'entrée dans `approved` est donc bloquée tant que `review.status` n'est pas
 * lui-même `approved`, ce que `transitionAutorisee` seul ne peut pas exprimer.
 */
export function transitionValide(depuis: EtatDalle, vers: EtatDalle, revue: StatutRevue): boolean {
  if (!transitionAutorisee(depuis, vers)) return false;
  if (vers === "approved" && revue !== "approved") return false;
  return true;
}

/** Les six dimensions produit qui regroupent les données d'une dalle. Seul axe de classement du manifeste : l'échelle spatiale est portée par `RelationSpatiale`, pas par un second regroupement. */
export const SPHERES = ["atmosphere", "hydrosphere", "biosphere", "anthroposphere", "lithosphere", "risks"] as const;
export type Sphere = typeof SPHERES[number];

export const RELATIONS_SPATIALES = ["intersects", "contains", "nearest", "hydrologically_related", "administrative", "model_at_point", "derived", "remote_detection"] as const;
export type RelationSpatiale = typeof RELATIONS_SPATIALES[number];

/** L'absence est une information : jamais transformée silencieusement en valeur par défaut. */
export const DISPONIBILITES = ["available", "not_found", "not_applicable", "source_unavailable", "error"] as const;
export type Disponibilite = typeof DISPONIBILITES[number];

export interface SourceDonnee {
  producer: string;
  dataset: string;
  url?: string | null;
  license?: string | null;
}

export interface TemporaliteDonnee {
  observedAt: string | null;
  retrievedAt: string;
  referencePeriod?: string | null;
}

export interface ResolutionDonnee {
  spatialM?: number | null;
}

export interface SelectionDonnee {
  method?: string | null;
  automaticChoice?: unknown;
  humanChoice?: unknown;
  reviewReason?: string | null;
}

export interface StatutDonnee {
  availability: Disponibilite;
  freshness?: string | null;
  review?: string | null;
}

/** Une information intégrée à une dalle : toujours traçable spatialement, temporellement et méthodologiquement (`03-DATA-CONTRACT.md`). */
export interface DonneeDalle {
  key: string;
  value: unknown;
  unit?: string | null;
  sphere: Sphere;
  spatialRelation: RelationSpatiale;
  distanceM?: number | null;
  source: SourceDonnee;
  time: TemporaliteDonnee;
  resolution?: ResolutionDonnee;
  selection?: SelectionDonnee;
  status: StatutDonnee;
}

export interface CentreDalle {
  lat: number;
  lon: number;
}

/** Polygone GeoJSON minimal (RFC 7946) : évite une dépendance à `@types/geojson` pour un seul champ. */
export interface PolygoneGeoJSON {
  type: "Polygon";
  coordinates: number[][][];
}

export interface IdentiteDalle {
  tileId: string;
  title: string | null;
  center: CentreDalle;
  widthM: 200;
  heightM: 200;
  areaM2: number;
  geometryWgs84: PolygoneGeoJSON;
  geometryProjected?: PolygoneGeoJSON;
  address?: string | null;
}

export interface ProductionDalle {
  createdAt: string;
  pipelineVersion: string;
  dataVersions?: Record<string, string>;
}

export interface SceneDalle {
  glb: string | null;
  terrain: string | null;
  orthophoto: string | null;
}

/** Regroupement des données d'une dalle par sphère. Voir `SPHERES` : ce n'est pas un dictionnaire ouvert. */
export type DonneesParSphere = { [sphere in Sphere]?: DonneeDalle[] };

export interface RevueDalle {
  status: StatutRevue;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  notes?: string | null;
}

export interface ManifesteDalle {
  schemaVersion: string;
  identity: IdentiteDalle;
  production: ProductionDalle;
  status: EtatDalle;
  scene?: SceneDalle;
  data: DonneesParSphere;
  quality?: Record<string, unknown>;
  provenance?: unknown[];
  review: RevueDalle;
}
