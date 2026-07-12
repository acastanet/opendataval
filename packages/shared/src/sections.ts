export interface Section {
  slug: string;
  titre: string;
  description: string;
  couleur: string;
}

export const SECTIONS = [
  {
    slug: "territoire",
    titre: "Le territoire",
    description: "Identité, les 15 communes de l'EPCI, cartes admin, cadastre, urbanisme.",
    couleur: "#2b3238",
  },
  {
    slug: "population",
    titre: "Population & société",
    description: "Démographie, logement, adresses, emploi, revenus.",
    couleur: "#3e6e82",
  },
  {
    slug: "economie",
    titre: "Économie & agriculture",
    description: "Établissements (SIRENE), équipements, AOP/IGP, parcellaire (RPG).",
    couleur: "#6b4226",
  },
  {
    slug: "finances",
    titre: "Finances publiques",
    description: "OFGL, balances comptables, marchés publics (commune + EPCI).",
    couleur: "#9a9b93",
  },
  {
    slug: "geographie",
    titre: "Géographie & relief",
    description: "Altimétrie, profil du Mont Aigoual, hydrographie, fonds IGN.",
    couleur: "#6b4226",
  },
  {
    slug: "meteo",
    titre: "Météo & climat",
    description: "Normales Aigoual, séries historiques, observations, vigilance.",
    couleur: "#3e6e82",
  },
  {
    slug: "environnement",
    titre: "Environnement & biodiversité",
    description: "Natura 2000, ZNIEFF, cœur du Parc national des Cévennes, qualité de l'air, eau.",
    couleur: "#7a8b5e",
  },
  {
    slug: "risques",
    titre: "Risques",
    description: "Inondation, feu de forêt, radon, mouvements de terrain, sismique, Cat-Nat.",
    couleur: "#b5533c",
  },
  {
    slug: "services",
    titre: "Services & vie pratique",
    description: "Mairie, annuaire, écoles, santé, associations.",
    couleur: "#9a9b93",
  },
  {
    slug: "tourisme",
    titre: "Tourisme & randonnée",
    description: "Points d'intérêt, sentiers GR/PR, offre touristique.",
    couleur: "#7a8b5e",
  },
  {
    slug: "mobilite",
    titre: "Mobilité",
    description: "Réseau liO (arrêts et lignes) desservant le territoire.",
    couleur: "#2b3238",
  },
  {
    slug: "democratie",
    titre: "Vie démocratique",
    description: "Résultats électoraux, élus du territoire.",
    couleur: "#b5533c",
  },
  {
    slug: "sources",
    titre: "Sources & open data",
    description: "Catalogue des jeux de données, licences, attributions, méthodologie.",
    couleur: "#9a9b93",
  },
] as const satisfies readonly Section[];

export type SectionSlug = (typeof SECTIONS)[number]["slug"];
