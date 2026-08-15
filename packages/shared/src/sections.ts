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
    couleur: "var(--vert-profond)",
  },
  {
    slug: "population",
    titre: "Population & société",
    description: "Démographie, logement, adresses, emploi, revenus.",
    couleur: "var(--torrent)",
  },
  {
    slug: "economie",
    titre: "Économie & agriculture",
    description: "Établissements (SIRENE), équipements, AOP/IGP, parcellaire (RPG).",
    couleur: "var(--chataigne)",
  },
  {
    slug: "finances",
    titre: "Finances publiques",
    description: "OFGL, balances comptables, marchés publics (commune + EPCI).",
    couleur: "var(--technique)",
  },
  {
    slug: "geographie",
    titre: "Géographie & relief",
    description: "Altimétrie, profil du Mont Aigoual, hydrographie, fonds IGN.",
    couleur: "var(--chataigne)",
  },
  {
    slug: "meteo",
    titre: "Météo & climat",
    description: "Normales Aigoual, séries historiques, observations, vigilance.",
    couleur: "var(--torrent)",
  },
  {
    slug: "environnement",
    titre: "Environnement & biodiversité",
    description: "Natura 2000, ZNIEFF, cœur du Parc national des Cévennes, qualité de l'air, eau.",
    couleur: "var(--biosphere)",
  },
  {
    slug: "risques",
    titre: "Risques",
    description: "Inondation, feu de forêt, radon, mouvements de terrain, sismique, Cat-Nat.",
    couleur: "var(--risques)",
  },
  {
    slug: "services",
    titre: "Services & vie pratique",
    description: "Mairie, annuaire, écoles, santé, associations.",
    couleur: "var(--technique)",
  },
  {
    slug: "tourisme",
    titre: "Tourisme & randonnée",
    description: "Points d'intérêt, sentiers GR/PR, offre touristique.",
    couleur: "var(--biosphere)",
  },
  {
    slug: "mobilite",
    titre: "Mobilité",
    description: "Réseau liO (arrêts et lignes) desservant le territoire.",
    couleur: "var(--vert-profond)",
  },
  {
    slug: "democratie",
    titre: "Vie démocratique",
    description: "Résultats électoraux, élus du territoire.",
    couleur: "var(--risques)",
  },
  {
    slug: "sources",
    titre: "Sources & open data",
    description: "Catalogue des jeux de données, licences, attributions, méthodologie.",
    couleur: "var(--technique)",
  },
] as const satisfies readonly Section[];

export type SectionSlug = (typeof SECTIONS)[number]["slug"];
