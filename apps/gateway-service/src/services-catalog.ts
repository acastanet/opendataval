import type { GatewayConfig } from "./config.js";

/**
 * Descripteur unique des services v2 exposés par le gateway. Source de vérité
 * partagée par la landing (`pages/landing.ts`), les pages de démo (`pages/demo.ts`)
 * et la sonde d'état (`status-route.ts`), afin d'éviter toute duplication.
 *
 * Le gateway reste une simple façade : ce catalogue ne contient que des
 * métadonnées de présentation et de démonstration, aucune logique métier.
 */

/** Type d'un champ de formulaire de démonstration. */
export type DemoFieldType = "number" | "text" | "select";

export interface DemoFieldOption {
  value: string;
  label: string;
}

export interface DemoField {
  /** Nom du paramètre de requête envoyé à la route publique. */
  name: string;
  /** Libellé accessible affiché dans le formulaire. */
  label: string;
  type: DemoFieldType;
  /** Valeur pré-remplie (exemple Val-d'Aigoual / Gard). */
  example: string;
  /** Le champ peut rester vide sans bloquer l'appel. */
  optional?: boolean;
  /** Aide courte affichée sous le champ. */
  hint?: string;
  /** Options pour un champ `select`. */
  options?: DemoFieldOption[];
  /**
   * Si vrai, la valeur du champ est ajoutée au chemin de la route (cas du pont
   * legacy) au lieu d'être passée en paramètre de requête.
   */
  appendToPath?: boolean;
  /**
   * Si vrai, le champ est vidé lorsque l'utilisateur renseigne des coordonnées
   * via « Me localiser » ou un clic sur la carte. Évite une incohérence quand un
   * autre critère de localisation était pré-rempli (ex. `department_code` de la
   * vigilance, qui doit alors être résolu depuis la position).
   */
  clearedByGeolocation?: boolean;
}

export interface ServiceDescriptor {
  /** Identifiant d'URL (`/api/v2/demo/:id`) et clé technique. */
  id: string;
  /** Nom lisible du microservice. */
  name: string;
  /** Rôle en une phrase. */
  role: string;
  /** Dépôt / emplacement du code. */
  repo: string;
  /** Méthode HTTP publique. */
  method: "GET";
  /** Route publique appelée par la démo (via le gateway). */
  publicRoute: string;
  /**
   * Route affichée sur les cartes lorsqu'elle diffère de `publicRoute` (ex.
   * `/api/v2/legacy/*`). Par défaut, `publicRoute`.
   */
  displayRoute?: string;
  /**
   * URL de santé interne à sonder pour l'état live. `null` pour le gateway
   * lui-même (toujours considéré vivant puisque c'est lui qui répond).
   */
  healthUrl: (config: GatewayConfig) => string | null;
  /** Champs du formulaire de démonstration. Vide = pas de paramètre. */
  demo: DemoField[];
  /** Affiche une démo dédiée lorsque le service n'utilise pas le formulaire générique. */
  hasDemo?: boolean;
}

/** Coordonnées d'exemple (Val-d'Aigoual / Gard), aussi centre par défaut de la carte. */
export const VAL_D_AIGOUAL = { lat: "44.0812", lon: "3.6421" } as const;

const ASSOCIATION_PRIMARY_CATEGORIES: DemoFieldOption[] = [
  { value: "", label: "Toutes les catégories primaires" },
  { value: "001000", label: "001000 - SPORTS" },
  { value: "002000", label: "002000 - CULTURE ET ARTS" },
  { value: "003000", label: "003000 - LOISIRS ET VIE SOCIALE" },
  { value: "004000", label: "004000 - ACTION SOCIALE" },
  { value: "005000", label: "005000 - ÉDUCATION ET FORMATION" },
  { value: "006000", label: "006000 - SANTÉ" },
  { value: "008000", label: "008000 - ENVIRONNEMENT ET CADRE DE VIE" },
  { value: "024000", label: "024000 - ÉLEVAGE ET ANIMAUX" },
];

const ASSOCIATION_SECONDARY_CATEGORIES: DemoFieldOption[] = [
  { value: "", label: "Toutes les catégories secondaires" },
  { value: "001005", label: "001005 : Football, futsal" },
  { value: "001015", label: "001015 : Tennis, badminton, squash" },
  { value: "001025", label: "001025 : Cyclisme, VTT, cyclotourisme" },
  { value: "001045", label: "001045 : Sports de combat (judo, karaté, boxe)" },
  { value: "001065", label: "001065 : Randonnée pédestre, marche nordique" },
  { value: "001080", label: "001080 : Gymnastique, fitness, yoga" },
  { value: "001115", label: "001115 : Chasse, piégeage" },
  { value: "001120", label: "001120 : Pêche, protection des milieux aquatiques" },
  { value: "002010", label: "002010 : Musique, chant choral, fanfares" },
  { value: "002015", label: "002015 : Danse, chorégraphie" },
  { value: "002020", label: "002020 : Théâtre, marionnettes, cirque" },
  { value: "002030", label: "002030 : Arts plastiques, peinture, sculpture, dessin" },
  { value: "002040", label: "002040 : Photographie, cinéma, vidéo" },
  { value: "002055", label: "002055 : Sauvegarde du patrimoine culturel et historique" },
  { value: "003005", label: "003005 : Clubs de troisième âge, seniors" },
  { value: "003020", label: "003020 : Comités des fêtes, kermesses" },
  { value: "003040", label: "003040 : Jeux de l'esprit (échecs, bridge, tarot)" },
  { value: "003060", label: "003060 : Associations de quartier, comités de riverains" },
  { value: "003080", label: "003080 : Clubs de loisirs scientifiques ou techniques" },
  { value: "004010", label: "004010 : Banques alimentaires, distribution de repas" },
  { value: "004015", label: "004015 : Aide aux personnes en situation de handicap" },
  { value: "004020", label: "004020 : Accompagnement, aide aux malades" },
  { value: "004040", label: "004040 : Centres aérés, colonies de vacances" },
  { value: "004050", label: "004050 : Insertion par l'activité économique (IAE)" },
  { value: "004065", label: "004065 : Droits des femmes, égalité des chances" },
  { value: "005010", label: "005010 : Associations de parents d'élèves" },
  { value: "005015", label: "005015 : Soutien scolaire, cours de rattrapage" },
  { value: "005025", label: "005025 : Éducation populaire, mouvements de jeunesse" },
  { value: "005040", label: "005040 : Formation continue des adultes" },
  { value: "006015", label: "006015 : Prévention des addictions (alcool, drogue, tabac)" },
  { value: "006025", label: "006025 : Don de sang, don d'organes" },
  { value: "006040", label: "006040 : Recherche médicale, financement de laboratoires" },
  { value: "008010", label: "008010 : Protection de la nature, de la faune et de la flore" },
  { value: "008015", label: "008015 : Écologie, énergies renouvelables, recyclage" },
  { value: "008035", label: "008035 : Amélioration du cadre de vie, urbanisme" },
  { value: "024005", label: "024005 : Défense des animaux, refuges, SPA" },
  { value: "024010", label: "024010 : Clubs canins, éducation des animaux domestiques" },
];

/**
 * Mairie de Val-d'Aigoual : point d'origine de l'app de terrain.
 * Coordonnées volontairement dupliquées depuis packages/shared/src/localisationsMeteo.ts.
 */
export const MAIRIE_VAL_D_AIGOUAL = {
  lat: 44.081192,
  lon: 3.641467,
  libelle: "Mairie de Val-d’Aigoual",
  adresse: "Rue de la Mairie, Valleraugue",
} as const;

/**
 * Retourne l'URL de base d'un service en repliant sur la valeur par défaut de
 * Compose lorsque la configuration ne fournit pas d'URL (champs optionnels).
 */
function baseUrl(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\/$/, "");
}

export const SERVICES: ServiceDescriptor[] = [
  {
    id: "gateway",
    name: "Gateway",
    role: "Façade HTTP unique des API v2. Valide les paramètres, propage x-request-id et normalise les erreurs. Aucun accès à la base.",
    repo: "apps/gateway-service",
    method: "GET",
    publicRoute: "/api/v2/gateway",
    healthUrl: () => null,
    demo: [],
  },
  {
    id: "map",
    name: "Map",
    role: "Styles, tuiles, relief et légendes cartographiques, servis directement par Caddy.",
    repo: "apps/map-service",
    method: "GET",
    publicRoute: "/api/v2/map/styles/territoire.json",
    healthUrl: (config) => `${baseUrl(config.mapServiceUrl, "http://map-service:3000")}/health`,
    demo: [],
    hasDemo: true,
  },
  {
    id: "geography",
    name: "Geography",
    role: "Résout des coordonnées (lat/lon) vers la commune et le département, avec altitude.",
    repo: "apps/geography-service",
    method: "GET",
    publicRoute: "/api/v2/geography/resolve",
    healthUrl: (config) => `${config.geographyServiceUrl}/health`,
    demo: [
      { name: "lat", label: "Latitude", type: "number", example: VAL_D_AIGOUAL.lat },
      { name: "lon", label: "Longitude", type: "number", example: VAL_D_AIGOUAL.lon },
      {
        name: "horizontalAccuracyMeters",
        label: "Précision horizontale (m)",
        type: "number",
        example: "25",
        optional: true,
        hint: "Précision GPS facultative.",
      },
      {
        name: "positionSource",
        label: "Source de position",
        type: "select",
        example: "manual",
        optional: true,
        options: [
          { value: "manual", label: "manual" },
          { value: "browser-geolocation", label: "browser-geolocation" },
          { value: "unknown", label: "unknown" },
        ],
      },
    ],
  },
  {
    id: "weather",
    name: "Weather",
    role: "Température ponctuelle pour une position, à partir du modèle MétéoFrance et du contexte territorial.",
    repo: "apps/weather-service",
    method: "GET",
    publicRoute: "/api/v2/weather/temperature",
    healthUrl: (config) => `${config.weatherServiceUrl}/health`,
    demo: [
      { name: "lat", label: "Latitude", type: "number", example: VAL_D_AIGOUAL.lat },
      { name: "lon", label: "Longitude", type: "number", example: VAL_D_AIGOUAL.lon },
      {
        name: "horizontalAccuracyMeters",
        label: "Précision horizontale (m)",
        type: "number",
        example: "25",
        optional: true,
      },
    ],
  },
  {
    id: "vigilance",
    name: "Weather Vigilance",
    role: "Vigilance météorologique départementale officielle (MétéoFrance), avec bulletins optionnels.",
    repo: "services/weather-vigilance",
    method: "GET",
    publicRoute: "/api/v2/vigilance",
    healthUrl: (config) =>
      `${baseUrl(config.vigilanceServiceUrl, "http://weather-vigilance-service:3000")}/healthz`,
    demo: [
      {
        name: "department_code",
        label: "Code département",
        type: "text",
        example: "30",
        optional: true,
        clearedByGeolocation: true,
        hint: "01 à 95, 2A ou 2B. Sinon, fournir lat/lon. Vidé si vous vous localisez.",
      },
      {
        name: "lat",
        label: "Latitude",
        type: "number",
        example: "",
        optional: true,
        hint: "Résolution du département via Geography.",
      },
      { name: "lon", label: "Longitude", type: "number", example: "", optional: true },
      {
        name: "include_bulletins",
        label: "Inclure les bulletins",
        type: "select",
        example: "false",
        optional: true,
        options: [
          { value: "false", label: "false" },
          { value: "true", label: "true" },
        ],
      },
    ],
  },
  {
    id: "fire",
    name: "Fire Detection",
    role: "Détection stateless de suspicions satellitaires de feu à proximité (FIRMS + EUMETSAT), avec rayon et historique explicites.",
    repo: "services/fire-detection",
    method: "GET",
    publicRoute: "/api/v2/fire/nearby",
    healthUrl: (config) =>
      `${baseUrl(config.fireDetectionServiceUrl, "http://fire-detection-service:3000")}/healthz`,
    demo: [
      { name: "lat", label: "Latitude", type: "number", example: VAL_D_AIGOUAL.lat },
      { name: "lon", label: "Longitude", type: "number", example: VAL_D_AIGOUAL.lon },
      { name: "radius_km", label: "Rayon (km)", type: "number", example: "50" },
      { name: "history_days", label: "Historique (jours)", type: "number", example: "7" },
      {
        name: "accuracy",
        label: "Précision GPS (m)",
        type: "number",
        example: "25",
        optional: true,
      },
    ],
  },
  {
    id: "associations",
    name: "Associations",
    role: "Liste consolidée, recherchable et cartographiable des associations d’une commune française.",
    repo: "apps/association-service",
    method: "GET",
    publicRoute: "/api/v2/associations",
    healthUrl: (config) =>
      `${baseUrl(config.associationServiceUrl, "http://association-service:3000")}/readyz`,
    demo: [
      {
        name: "code_insee",
        label: "Code INSEE de la commune",
        type: "text",
        example: "30339",
        hint: "30339 correspond à Val-d’Aigoual.",
      },
      {
        name: "q",
        label: "Recherche",
        type: "text",
        example: "",
        optional: true,
        hint: "Titre, objet ou domaine d’activité.",
      },
      {
        name: "status",
        label: "Statut administratif",
        type: "select",
        example: "",
        optional: true,
        options: [
          { value: "", label: "Tous les statuts" },
          { value: "active", label: "Active" },
          { value: "dissolved", label: "Dissoute" },
          { value: "unknown", label: "Inconnu" },
        ],
      },
      {
        name: "category_primary",
        label: "Catégorie principale",
        type: "select",
        example: "",
        optional: true,
        options: ASSOCIATION_PRIMARY_CATEGORIES,
      },
      {
        name: "category_secondary",
        label: "Catégorie secondaire",
        type: "select",
        example: "",
        optional: true,
        options: ASSOCIATION_SECONDARY_CATEGORIES,
      },
      {
        name: "limit",
        label: "Nombre de résultats",
        type: "number",
        example: "25",
        optional: true,
        hint: "Maximum : 100.",
      },
      {
        name: "cursor",
        label: "Curseur de page suivante",
        type: "text",
        example: "",
        optional: true,
      },
    ],
  },
  {
    id: "legacy",
    name: "Legacy (pont historique)",
    role: "Pont en lecture seule vers le monolithe historique /api/*. GET et HEAD uniquement.",
    repo: "apps/api",
    method: "GET",
    publicRoute: "/api/v2/legacy",
    displayRoute: "/api/v2/legacy/*",
    healthUrl: (config) => `${config.legacyApiUrl}/api/health`,
    demo: [
      {
        name: "path",
        label: "Chemin sous /api",
        type: "text",
        example: "/health",
        appendToPath: true,
        hint: "Chemin relatif appelé sur le monolithe, ex. /health ou /territoire.",
      },
    ],
  },
];

/** Retourne le descripteur d'un service par son identifiant, ou `undefined`. */
export function findService(id: string): ServiceDescriptor | undefined {
  return SERVICES.find((service) => service.id === id);
}

/**
 * Indique si le service manipule des coordonnées géographiques, c'est-à-dire si
 * son formulaire de démonstration comporte à la fois un champ `lat` et `lon`.
 * Utilisé pour n'activer la géolocalisation et la carte que sur ces démos.
 */
export function serviceHasCoordinates(service: ServiceDescriptor): boolean {
  const names = new Set(service.demo.map((field) => field.name));
  return names.has("lat") && names.has("lon");
}
