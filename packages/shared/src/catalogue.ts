import type { SectionSlug } from "./sections.js";

/**
 * Descripteur unique du portail. Sépare deux notions jusqu'ici mélangées dans
 * `CATALOGUE_SOURCES` :
 *  - `SourceAmont` : un jeu de données externe, ingéré par un job worker (une ligne de `meta.sources`).
 *  - `CoucheCarte` : un ensemble d'objets de `couches.objets`, affichable sur les cartes.
 *
 * Fichier client-safe (aucun import `pg`), importable côté front via
 * `@opendata-vda/shared/catalogue`. C'est le point d'édition unique : ajouter une
 * source = 1 `SourceAmont` + 1..n `CoucheCarte`, aucune modification du front.
 */

/** Source amont = un jeu de données externe, ingéré par un job worker. */
export interface SourceAmont {
  slug: string; // stable — PK de meta.sources
  nom: string;
  url: string;
  licence: string;
  attribution?: string; // mention courte carte ("© IGN", "© contributeurs OSM")
  frequence: string;
  theme: SectionSlug; // rubrique pour /sources
  job?: string; // slug du job worker — résout le désalignement jobs ↔ catalogue
}

export type FormatChamp = "texte" | "nombre" | "metres" | "surface_ha" | "date" | "labels_json";

export interface ChampPopup {
  cle: string;
  libelle: string;
  format?: FormatChamp;
}

/** Couche = un jeu d'objets de couches.objets, affichable sur les cartes. */
export interface CoucheCarte {
  slug: string; // = couches.objets.couche — NE PAS renommer (URLs stables)
  libelle: string; // "Cavité souterraine"
  libellePluriel: string; // "Cavités souterraines"
  section: SectionSlug;
  source: string; // slug SourceAmont
  geometrie: "point" | "polygone"; // "ligne" sera ajouté au chantier B.4
  couleur: string;
  cluster?: boolean;
  tirets?: boolean; // contour pointillé (znieff)
  visibleParDefaut?: boolean; // état initial sur /carte
  // `readonly` : ces champs sont renseignés via `as const` (tuples/objets en lecture seule).
  titreProps?: readonly string[]; // titre composé (adresse : numero + rep + nom_voie)
  popup?: readonly ChampPopup[]; // absent = auto (props scalaires non techniques)
  chronique?: { readonly endpoint: string; readonly cle: string }; // piezo : /api/piezo/chronique + code_bss
}

// ────────────────────────────────────────────────────────────────────────────
// Sources amont (peuplent meta.sources et la page /sources)
// ────────────────────────────────────────────────────────────────────────────

export const CATALOGUE_SOURCES = [
  {
    slug: "geoapi",
    nom: "API Découpage administratif",
    url: "https://geo.api.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "territoire",
    job: "geoapi",
  },
  {
    slug: "adresse",
    nom: "Base Adresse Nationale (BAN)",
    url: "https://adresse.data.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "population",
    job: "adresses",
  },
  {
    slug: "entreprise",
    nom: "Recherche d'entreprises (SIRENE ouvert)",
    url: "https://recherche-entreprises.api.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "economie",
    job: "entreprises",
  },
  {
    slug: "parcelle_agricole",
    nom: "IGN — Registre Parcellaire Graphique (RPG)",
    url: "https://geoservices.ign.fr/rpg",
    licence: "Licence Ouverte 2.0",
    attribution: "© IGN",
    frequence: "annuelle",
    theme: "economie",
    job: "rpg",
  },
  {
    slug: "signe_qualite",
    nom: "INAO — Aires géographiques des AOC/AOP et IGP",
    url: "https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop",
    licence: "Licence Ouverte 2.0",
    attribution: "© INAO",
    frequence: "annuelle",
    theme: "economie",
    job: "signes_qualite",
  },
  {
    slug: "hubeau",
    nom: "Hub'Eau — API sur l'eau (Eau France)",
    url: "https://hubeau.eaufrance.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "quotidienne",
    theme: "environnement",
    job: "hubeau",
  },
  {
    slug: "apicarto",
    nom: "API Carto IGN — Données nature",
    url: "https://apicarto.ign.fr/api/nature",
    licence: "Licence Ouverte 2.0",
    attribution: "© IGN",
    frequence: "trimestrielle",
    theme: "environnement",
    job: "apicarto",
  },
  {
    slug: "georisques",
    nom: "Géorisques — API globale",
    url: "https://www.georisques.gouv.fr/api",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "risques",
    job: "georisques",
  },
  {
    slug: "ecole",
    nom: "Annuaire de l'éducation",
    url: "https://data.education.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "services",
    job: "education",
  },
  {
    slug: "administration",
    nom: "Annuaire de l'administration",
    url: "https://api-lannuaire.service-public.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "services",
    job: "lannuaire",
  },
  {
    slug: "poi_osm",
    nom: "OpenStreetMap (Overpass)",
    url: "https://overpass-api.de",
    licence: "ODbL — attribution © contributeurs OpenStreetMap",
    attribution: "© contributeurs OpenStreetMap",
    frequence: "hebdomadaire",
    theme: "tourisme",
    job: "osm",
  },
  {
    slug: "geologie",
    nom: "BRGM — Carte géologique 1/50 000 (WMS)",
    url: "https://geoservices.brgm.fr/geologie",
    licence: "Ouverte (© BRGM)",
    attribution: "© BRGM",
    frequence: "référentiel stable",
    theme: "geographie",
  },
  {
    slug: "station_meteo",
    nom: "Météo-France — Observations du réseau de stations (DPObs)",
    url: "https://portail-api.meteofrance.fr",
    licence: "Licence Ouverte 2.0 (ETALAB)",
    attribution: "© Météo-France",
    frequence: "6 min à horaire",
    theme: "meteo",
    job: "meteo_obs",
  },
  {
    slug: "meteo_infoclimat",
    nom: "Infoclimat — Stations amateurs StatIC (open data)",
    url: "https://www.infoclimat.fr/opendata/",
    licence: "CC BY-NC 4.0 (CC BY pour certaines stations)",
    frequence: "horaire",
    theme: "meteo",
    job: "meteo_infoclimat",
  },
  {
    slug: "previsions_meteo",
    nom: "Open-Meteo — Prévisions (modèles Météo-France AROME/ARPEGE)",
    url: "https://open-meteo.com",
    licence: "CC BY 4.0",
    frequence: "temps réel",
    theme: "meteo",
  },
  {
    slug: "climat_quotidien",
    nom: "Météo-France — Données climatologiques quotidiennes",
    url: "https://meteo.data.gouv.fr",
    licence: "Licence Ouverte 2.0",
    attribution: "© Météo-France",
    frequence: "mensuelle",
    theme: "meteo",
    job: "meteo_climat",
  },
] as const satisfies readonly SourceAmont[];

// ────────────────────────────────────────────────────────────────────────────
// Couches cartographiques (couches.objets → cartes, panneau, popups)
// ────────────────────────────────────────────────────────────────────────────

export const COUCHES = [
  // risques
  {
    slug: "cavite",
    libelle: "Cavité souterraine",
    libellePluriel: "Cavités souterraines",
    section: "risques",
    source: "georisques",
    geometrie: "point",
    couleur: "#6b4226",
  },
  {
    slug: "mouvement",
    libelle: "Mouvement de terrain",
    libellePluriel: "Mouvements de terrain",
    section: "risques",
    source: "georisques",
    geometrie: "point",
    couleur: "#b5533c",
  },
  // environnement
  {
    slug: "piezo",
    libelle: "Piézomètre (nappe)",
    libellePluriel: "Piézomètres (nappes)",
    section: "environnement",
    source: "hubeau",
    geometrie: "point",
    couleur: "#3e6e82",
    popup: [{ cle: "altitude_m", libelle: "altitude", format: "metres" }],
    chronique: { endpoint: "/api/piezo/chronique", cle: "external_id" },
  },
  {
    slug: "station_hydro",
    libelle: "Station hydrométrique",
    libellePluriel: "Stations hydrométriques",
    section: "environnement",
    source: "hubeau",
    geometrie: "point",
    couleur: "#3e6e82",
  },
  {
    slug: "natura2000",
    libelle: "Site Natura 2000",
    libellePluriel: "Sites Natura 2000",
    section: "environnement",
    source: "apicarto",
    geometrie: "polygone",
    couleur: "#7a8b5e",
  },
  {
    slug: "znieff",
    libelle: "ZNIEFF",
    libellePluriel: "ZNIEFF",
    section: "environnement",
    source: "apicarto",
    geometrie: "polygone",
    couleur: "#7a9a4a",
    tirets: true,
  },
  // services
  {
    slug: "ecole",
    libelle: "École",
    libellePluriel: "Écoles",
    section: "services",
    source: "ecole",
    geometrie: "point",
    couleur: "#2b3238",
  },
  {
    slug: "administration",
    libelle: "Service public",
    libellePluriel: "Services publics",
    section: "services",
    source: "administration",
    geometrie: "point",
    couleur: "#2b3238",
  },
  // tourisme
  {
    slug: "poi_osm",
    libelle: "Point d'intérêt",
    libellePluriel: "Points d'intérêt",
    section: "tourisme",
    source: "poi_osm",
    geometrie: "point",
    couleur: "#9a9b93",
    cluster: true,
  },
  // population
  {
    slug: "adresse",
    libelle: "Adresse",
    libellePluriel: "Adresses",
    section: "population",
    source: "adresse",
    geometrie: "point",
    couleur: "#3e6e82",
    cluster: true,
    titreProps: ["numero", "rep", "nom_voie"],
    popup: [
      { cle: "code_postal", libelle: "code postal" },
      { cle: "nom_commune", libelle: "commune" },
    ],
  },
  // economie
  {
    slug: "entreprise",
    libelle: "Établissement (SIRENE)",
    libellePluriel: "Établissements (SIRENE)",
    section: "economie",
    source: "entreprise",
    geometrie: "point",
    couleur: "#6b4226",
    cluster: true,
    popup: [
      { cle: "enseigne", libelle: "enseigne" },
      { cle: "naf", libelle: "activité (NAF)" },
      { cle: "commune", libelle: "commune" },
    ],
  },
  {
    slug: "parcelle_agricole",
    libelle: "Parcelle agricole (RPG)",
    libellePluriel: "Parcelles agricoles (RPG)",
    section: "economie",
    source: "parcelle_agricole",
    geometrie: "polygone",
    couleur: "#5c7a44",
    titreProps: ["libelleCulture"],
    popup: [
      { cle: "codeCulture", libelle: "code culture" },
      { cle: "surfaceHa", libelle: "surface", format: "surface_ha" },
    ],
  },
  {
    slug: "signe_qualite",
    libelle: "Signe de qualité (AOC/AOP/IGP)",
    libellePluriel: "Signes de qualité (AOC/AOP/IGP)",
    section: "economie",
    source: "signe_qualite",
    geometrie: "polygone",
    couleur: "#c99a3e",
    titreProps: ["commune"],
    popup: [{ cle: "labels", libelle: "", format: "labels_json" }],
  },
  // meteo
  {
    slug: "station_meteo",
    libelle: "Station météo",
    libellePluriel: "Stations météo",
    section: "meteo",
    source: "station_meteo",
    geometrie: "point",
    couleur: "#3e6e82",
    popup: [
      { cle: "altitude_m", libelle: "altitude", format: "metres" },
      { cle: "type", libelle: "réseau" },
      { cle: "licence", libelle: "licence" },
    ],
  },
] as const satisfies readonly CoucheCarte[];

// ────────────────────────────────────────────────────────────────────────────
// Helpers dérivés
// ────────────────────────────────────────────────────────────────────────────

export const COUCHES_PAR_SLUG: Map<string, CoucheCarte> = new Map(COUCHES.map((c) => [c.slug, c]));
export const SOURCES_PAR_SLUG: Map<string, SourceAmont> = new Map(CATALOGUE_SOURCES.map((s) => [s.slug, s]));

export function couchesDeSection(slug: SectionSlug): CoucheCarte[] {
  return COUCHES.filter((c) => c.section === slug);
}

export function sourceDeCouche(couche: CoucheCarte): SourceAmont | undefined {
  return SOURCES_PAR_SLUG.get(couche.source);
}

// ────────────────────────────────────────────────────────────────────────────
// Popups — fonctions pures (aucun DOM), partagées par toutes les îles
// ────────────────────────────────────────────────────────────────────────────

/** Clés jamais affichées dans une popup (techniques ou déjà portées par le titre). */
const CLES_TECHNIQUES = new Set(["external_id", "source_url", "tags", "nom"]);

/** Traduction clé technique → libellé lisible pour les popups auto. */
const LIBELLE_CLE: Record<string, string> = {
  altitude_m: "altitude",
  nom_commune: "commune",
  cours_eau: "cours d'eau",
  en_service: "en service",
  nb_mesures: "mesures",
  date_debut: "depuis",
  reperage: "repérage",
  fiabilite: "fiabilité",
  precision: "précision",
  gestionnaire: "gestionnaire",
  id_mnhn: "identifiant MNHN",
  statut: "statut",
  sigle: "sigle",
  adresse: "adresse",
  commune: "commune",
  lieu: "lieu",
};

function estVide(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function formatValeur(format: FormatChamp | undefined, v: unknown): string {
  switch (format) {
    case "metres":
      return `${v} m`;
    case "surface_ha":
      return `${Number(v).toLocaleString("fr-FR")} ha`;
    case "nombre":
      return Number(v).toLocaleString("fr-FR");
    case "labels_json": {
      // MapLibre sérialise les propriétés non scalaires des sources GeoJSON en chaîne JSON :
      // `labels` arrive donc en string une fois la couche rendue, pas en tableau.
      let arr: unknown = v;
      if (typeof arr === "string") {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = [];
        }
      }
      if (!Array.isArray(arr)) return "";
      return arr
        .map((l) =>
          l && typeof l === "object" && "label" in l
            ? `${(l as { label: string }).label}${"type" in l ? ` (${(l as { type: string }).type})` : ""}`
            : String(l),
        )
        .join(" · ");
    }
    default:
      return String(v);
  }
}

/** Titre de popup : titreProps composé, sinon nom de l'objet, sinon libellé de la couche. */
export function titrePopup(couche: CoucheCarte, props: Record<string, unknown>): string {
  if (couche.titreProps) {
    const t = couche.titreProps
      .map((k) => props[k])
      .filter((v) => !estVide(v))
      .join(" ");
    if (t) return t;
  }
  return (props.nom as string) ?? (props.nom_ld as string) ?? couche.libelle;
}

/** Lignes de popup : descripteur `popup` explicite, sinon auto sur les props scalaires non techniques. */
export function lignesPopup(
  couche: CoucheCarte,
  props: Record<string, unknown>,
): { libelle: string; valeur: string }[] {
  if (couche.popup) {
    return couche.popup
      .filter((c) => !estVide(props[c.cle]))
      .map((c) => ({ libelle: c.libelle, valeur: formatValeur(c.format, props[c.cle]) }))
      .filter((l) => l.valeur !== "");
  }
  return Object.entries(props)
    .filter(([k]) => !CLES_TECHNIQUES.has(k))
    .filter(([, v]) => !estVide(v))
    .map(([k, v]) => ({ libelle: LIBELLE_CLE[k] ?? k.replace(/_/g, " "), valeur: String(v) }));
}
