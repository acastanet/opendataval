import type { SectionSlug } from "./sections.js";

export const TERRITOIRE = {
  commune: {
    codeInsee: "30339",
    nom: "Val-d'Aigoual",
    siren: "200082725",
    codePostal: "30570",
    centre: { lon: 3.6272, lat: 44.081 },
    superficieHa: 9561.82,
  },
  epci: {
    code: "200034601",
    nom: "CC Causses Aigoual Cévennes – Terres Solidaires",
    nomCourt: "CC Causses Aigoual Cévennes",
  },
  montAigoual: { lon: 3.5814, lat: 44.1216, altitudeM: 1567 },
  stationMeteo: {
    numPoste: "30339001",
    synop: "07560",
    nom: "Mont Aigoual",
    altitudeM: 1567,
    // Normales officielles 1991-2020, fiche climatologique Météo-France du poste 30339001
    normales: { periode: "1991-2020", tMoyC: 5.7, precipMmAn: 1970, joursGelAn: 128 },
  },
  // [ouest, sud, est, nord]
  bbox: [3.52, 44.02, 3.75, 44.15] as [number, number, number, number],
} as const;

export const COMMUNES_EPCI = [
  { codeInsee: "30074", nom: "Causse-Bégon", population: 25 },
  { codeInsee: "30105", nom: "Dourbies", population: 177 },
  { codeInsee: "30108", nom: "L'Estréchure", population: 151 },
  { codeInsee: "30139", nom: "Lanuéjols", population: 341 },
  { codeInsee: "30140", nom: "Lasalle", population: 1202 },
  { codeInsee: "30195", nom: "Peyrolles-en-Cévennes", population: 30 },
  { codeInsee: "30198", nom: "Les Plantiers", population: 228 },
  { codeInsee: "30213", nom: "Revens", population: 37 },
  { codeInsee: "30229", nom: "Saint-André-de-Majencoules", population: 599 },
  { codeInsee: "30231", nom: "Saint-André-de-Valborgne", population: 366 },
  { codeInsee: "30297", nom: "Saint-Sauveur-Camprieu", population: 207 },
  { codeInsee: "30310", nom: "Saumane", population: 303 },
  { codeInsee: "30322", nom: "Soudorgues", population: 269 },
  { codeInsee: "30332", nom: "Trèves", population: 116 },
  { codeInsee: "30339", nom: "Val-d'Aigoual", population: 1412 },
] as const;

interface SourceCatalogue {
  slug: string;
  nom: string;
  url: string;
  licence: string;
  frequence: string;
  theme: SectionSlug;
}

export const CATALOGUE_SOURCES = [
  {
    slug: "geoapi",
    nom: "API Découpage administratif",
    url: "https://geo.api.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "territoire",
  },
  {
    slug: "cavite",
    nom: "Géorisques — Cavités souterraines",
    url: "https://www.georisques.gouv.fr/api/v1/cavites",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "risques",
  },
  {
    slug: "mouvement",
    nom: "Géorisques — Mouvements de terrain",
    url: "https://www.georisques.gouv.fr/api/v1/mvt",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "risques",
  },
  {
    slug: "piezo",
    nom: "Hub'Eau — Niveaux des nappes",
    url: "https://hubeau.eaufrance.fr/api/v1/niveaux_nappes",
    licence: "Licence Ouverte 2.0",
    frequence: "quotidienne",
    theme: "environnement",
  },
  {
    slug: "station_hydro",
    nom: "Hub'Eau — Hydrométrie",
    url: "https://hubeau.eaufrance.fr/api/v2/hydrometrie",
    licence: "Licence Ouverte 2.0",
    frequence: "quotidienne",
    theme: "environnement",
  },
  {
    slug: "natura2000",
    nom: "API Carto IGN — Natura 2000",
    url: "https://apicarto.ign.fr/api/nature/natura-habitat",
    licence: "Licence Ouverte 2.0",
    frequence: "trimestrielle",
    theme: "environnement",
  },
  {
    slug: "znieff",
    nom: "API Carto IGN — ZNIEFF",
    url: "https://apicarto.ign.fr/api/nature/znieff1",
    licence: "Licence Ouverte 2.0",
    frequence: "trimestrielle",
    theme: "environnement",
  },
  {
    slug: "ecole",
    nom: "Annuaire de l'éducation",
    url: "https://data.education.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "services",
  },
  {
    slug: "administration",
    nom: "Annuaire de l'administration",
    url: "https://api-lannuaire.service-public.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "services",
  },
  {
    slug: "poi_osm",
    nom: "OpenStreetMap (Overpass)",
    url: "https://overpass-api.de",
    licence: "ODbL — attribution © contributeurs OpenStreetMap",
    frequence: "hebdomadaire",
    theme: "tourisme",
  },
  {
    slug: "geologie",
    nom: "BRGM — Carte géologique 1/50 000 (WMS)",
    url: "https://geoservices.brgm.fr/geologie",
    licence: "Ouverte (© BRGM)",
    frequence: "référentiel stable",
    theme: "geographie",
  },
  {
    slug: "adresse",
    nom: "Base Adresse Nationale (BAN)",
    url: "https://adresse.data.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "population",
  },
  {
    slug: "entreprise",
    nom: "Recherche d'entreprises (SIRENE ouvert)",
    url: "https://recherche-entreprises.api.gouv.fr",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "economie",
  },
  {
    slug: "parcelle_agricole",
    nom: "IGN — Registre Parcellaire Graphique (RPG)",
    url: "https://geoservices.ign.fr/rpg",
    licence: "Licence Ouverte 2.0",
    frequence: "annuelle",
    theme: "economie",
  },
  {
    slug: "signe_qualite",
    nom: "INAO — Aires géographiques des AOC/AOP et IGP",
    url: "https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop",
    licence: "Licence Ouverte 2.0",
    frequence: "annuelle",
    theme: "economie",
  },
  {
    slug: "georisques",
    nom: "Géorisques — API globale",
    url: "https://www.georisques.gouv.fr/api",
    licence: "Licence Ouverte 2.0",
    frequence: "mensuelle",
    theme: "risques",
  },
  {
    slug: "apicarto",
    nom: "API Carto IGN — Données nature",
    url: "https://apicarto.ign.fr/api/nature",
    licence: "Licence Ouverte 2.0",
    frequence: "trimestrielle",
    theme: "environnement",
  },
  {
    slug: "station_meteo",
    nom: "Météo-France — Observations du réseau de stations (DPObs)",
    url: "https://portail-api.meteofrance.fr",
    licence: "Licence Ouverte 2.0 (ETALAB)",
    frequence: "6 min à horaire",
    theme: "meteo",
  },
  {
    slug: "meteo_infoclimat",
    nom: "Infoclimat — Stations amateurs StatIC (open data)",
    url: "https://www.infoclimat.fr/opendata/",
    licence: "CC BY-NC 4.0 (CC BY pour certaines stations)",
    frequence: "horaire",
    theme: "meteo",
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
    frequence: "mensuelle",
    theme: "meteo",
  },
] as const satisfies readonly SourceCatalogue[];
