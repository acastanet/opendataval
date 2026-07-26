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
}

/** Coordonnées d'exemple (Val-d'Aigoual / Gard), aussi centre par défaut de la carte. */
export const VAL_D_AIGOUAL = { lat: "44.0812", lon: "3.6421" } as const;

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
    role: "Détection stateless de suspicions de feu à proximité (FIRMS + EUMETSAT), rayon 50 km sur 7 jours.",
    repo: "services/fire-detection",
    method: "GET",
    publicRoute: "/api/v2/fire/nearby",
    healthUrl: (config) =>
      `${baseUrl(config.fireDetectionServiceUrl, "http://fire-detection-service:3000")}/healthz`,
    demo: [
      { name: "lat", label: "Latitude", type: "number", example: VAL_D_AIGOUAL.lat },
      { name: "lon", label: "Longitude", type: "number", example: VAL_D_AIGOUAL.lon },
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
