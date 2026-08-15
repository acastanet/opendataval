/**
 * Texte de référence LAV — source de vérité unique.
 * Repris à l'identique du texte exact fourni, sans reformulation.
 * Ce module alimente à la fois la page d'accueil et la page dédiée /lav
 * ainsi que le prototype autonome doc/design/lav.html (dupliqué pour rester
 * autonome hors build Astro).
 */

export const LAV_TITRE = "LAV : Localiser, Agréger, Valoriser";
export const LAV_SOUSTITRE =
  "Un système d'intégration des données publiques au service des territoires et des usages";

export const LAV_INTRO = [
  "LAV transforme des données publiques dispersées en informations utiles, organisées autour d'un lieu.",
];

export const LAV_MANIFESTE = [
  "À partir d'un point sur la carte, LAV rassemble les données disponibles pour décrire son environnement : relief, bâtiments, végétation, eau, sous-sol, météo, climat, activités humaines, infrastructures et risques.",
  "Issues de multiples sources publiques, ces données sont localisées, croisées et replacées dans leur contexte. Elles alimentent un jumeau numérique documenté et évolutif, qui propose une lecture cohérente du lieu, de son voisinage et de son territoire.",
  "LAV fournit ainsi un socle de données commun, à partir duquel peuvent être développés des services répondant à des besoins concrets, locaux et citoyens. Les applications déjà réalisées illustrent cette diversité d'usages.",
] as const;

export interface LavUsage {
  id: string;
  titre: string;
  /** Description exacte — texte après le titre en gras */
  description: string;
  /** Phrase complète pour affichage brut */
  phraseComplete: string;
  /** Service ids pour liens (optionnel) */
  liens: string[];
  /** Sphère pour classement couleur */
  sphere: "anthroposphere" | "lithosphere" | "atmosphere" | "hydrosphere" | "risques";
}

export const LAV_USAGES: LavUsage[] = [
  {
    id: "carte-territoire",
    titre: "Carte du territoire",
    description:
      "rassemble sur une même interface les données relatives à la géologie, au sous-sol, à l'eau, aux milieux naturels et aux services publics.",
    phraseComplete:
      "Carte du territoire rassemble sur une même interface les données relatives à la géologie, au sous-sol, à l'eau, aux milieux naturels et aux services publics.",
    liens: ["carte"],
    sphere: "anthroposphere",
  },
  {
    id: "relief-3d",
    titre: "Relief 3D",
    description:
      "permet d'explorer le terrain, les bâtiments et la végétation à partir des données LiDAR et des modèles numériques de terrain.",
    phraseComplete:
      "Relief 3D permet d'explorer le terrain, les bâtiments et la végétation à partir des données LiDAR et des modèles numériques de terrain.",
    liens: ["relief", "valleraugue-3d"],
    sphere: "lithosphere",
  },
  {
    id: "meteo-climat",
    titre: "Météo essentielle, Bilan thermique et Fiche climat",
    description:
      "fournissent une information localisée sur la situation météorologique, les prévisions et les évolutions climatiques du lieu.",
    phraseComplete:
      "Météo essentielle, Bilan thermique et la Fiche climat fournissent une information localisée sur la situation météorologique, les prévisions et les évolutions climatiques du lieu.",
    liens: ["meteo-essentiel", "meteo-bilan-thermique", "climat"],
    sphere: "atmosphere",
  },
  {
    id: "eau",
    titre: "Tableau de bord de l'eau",
    description:
      "permet de suivre les cours d'eau, les crues, les étiages, les nappes souterraines ainsi que la qualité de l'eau et des sites de baignade.",
    phraseComplete:
      "Le Tableau de bord de l'eau permet de suivre les cours d'eau, les crues, les étiages, les nappes souterraines ainsi que la qualité de l'eau et des sites de baignade.",
    liens: ["eau-tableau-de-bord"],
    sphere: "hydrosphere",
  },
  {
    id: "incendies",
    titre: "Incendies, risque et consignes, Vigilance feu et Incendies, temps réel",
    description:
      "mettent en relation les niveaux officiels de vigilance, les recommandations publiques et les détections thermiques satellitaires récentes.",
    phraseComplete:
      "Incendies, risque et consignes, Vigilance feu et Incendies, temps réel mettent en relation les niveaux officiels de vigilance, les recommandations publiques et les détections thermiques satellitaires récentes.",
    liens: ["incendies", "vigilance-feu", "incendies-temps-reel"],
    sphere: "risques",
  },
  {
    id: "valfeu",
    titre: "Valfeu",
    description:
      "conçue pour un usage mobile sur le terrain, localise l'utilisateur et recherche les suspicions satellitaires de feu observées à proximité.",
    phraseComplete:
      "Valfeu, conçue pour un usage mobile sur le terrain, localise l'utilisateur et recherche les suspicions satellitaires de feu observées à proximité.",
    liens: ["valfeu"],
    sphere: "risques",
  },
  {
    id: "old",
    titre: "OLD, obligations légales de débroussaillement",
    description:
      "aide à préparer le périmètre indicatif à débroussailler en croisant la position d'un bâtiment, le cadastre, le zonage réglementaire et les données cartographiques.",
    phraseComplete:
      "OLD, obligations légales de débroussaillement, aide à préparer le périmètre indicatif à débroussailler en croisant la position d'un bâtiment, le cadastre, le zonage réglementaire et les données cartographiques.",
    liens: ["old"],
    sphere: "risques",
  },
  {
    id: "itineraire-pl",
    titre: "Itinéraire poids lourd",
    description:
      "propose un parcours adapté au gabarit connu du véhicule et signale les portions pour lesquelles les données ouvertes ne permettent pas une vérification complète.",
    phraseComplete:
      "Itinéraire poids lourd propose un parcours adapté au gabarit connu du véhicule et signale les portions pour lesquelles les données ouvertes ne permettent pas une vérification complète.",
    liens: ["itineraire-poids-lourd"],
    sphere: "anthroposphere",
  },
];

/** Phrases exactes pour affichage en liste brute — conforme à la source markdown */
export const LAV_USAGES_PHRASES_BRUTES: string[] = [
  "Carte du territoire rassemble sur une même interface les données relatives à la géologie, au sous-sol, à l'eau, aux milieux naturels et aux services publics.",
  "Relief 3D permet d'explorer le terrain, les bâtiments et la végétation à partir des données LiDAR et des modèles numériques de terrain.",
  "Météo essentielle, Bilan thermique et la Fiche climat fournissent une information localisée sur la situation météorologique, les prévisions et les évolutions climatiques du lieu.",
  "Le Tableau de bord de l'eau permet de suivre les cours d'eau, les crues, les étiages, les nappes souterraines ainsi que la qualité de l'eau et des sites de baignade.",
  "Incendies, risque et consignes, Vigilance feu et Incendies, temps réel mettent en relation les niveaux officiels de vigilance, les recommandations publiques et les détections thermiques satellitaires récentes.",
  "Valfeu, conçue pour un usage mobile sur le terrain, localise l'utilisateur et recherche les suspicions satellitaires de feu observées à proximité.",
  "OLD, obligations légales de débroussaillement, aide à préparer le périmètre indicatif à débroussailler en croisant la position d'un bâtiment, le cadastre, le zonage réglementaire et les données cartographiques.",
  "Itinéraire poids lourd propose un parcours adapté au gabarit connu du véhicule et signale les portions pour lesquelles les données ouvertes ne permettent pas une vérification complète.",
];

export const LAV_INFRASTRUCTURE = [
  "Ces applications s'appuient sur la même infrastructure de localisation, de collecte, de cartographie et de documentation des données. Elles peuvent ainsi être enrichies ou complétées sans reconnecter séparément chaque source publique.",
  "Autour de cette infrastructure commune, chaque application répond à une question concrète : comprendre un lieu, suivre une situation, préparer une intervention ou éclairer une décision.",
] as const;

export const LAV_FINALITES =
  "Comprendre un lieu. Suivre une situation. Préparer une intervention. Éclairer une décision.";

/** Texte intégral markdown — copie exacte pour génération ou vérification */
export const LAV_MARKDOWN = `# LAV : Localiser, Agréger, Valoriser

*Un système d'intégration des données publiques au service des territoires et des usages*

LAV transforme des données publiques dispersées en informations utiles, organisées autour d'un lieu.

À partir d'un point sur la carte, LAV rassemble les données disponibles pour décrire son environnement : relief, bâtiments, végétation, eau, sous-sol, météo, climat, activités humaines, infrastructures et risques.

Issues de multiples sources publiques, ces données sont localisées, croisées et replacées dans leur contexte. Elles alimentent un jumeau numérique documenté et évolutif, qui propose une lecture cohérente du lieu, de son voisinage et de son territoire.

LAV fournit ainsi un socle de données commun, à partir duquel peuvent être développés des services répondant à des besoins concrets, locaux et citoyens. Les applications déjà réalisées illustrent cette diversité d'usages.

- **Carte du territoire** rassemble sur une même interface les données relatives à la géologie, au sous-sol, à l'eau, aux milieux naturels et aux services publics.
- **Relief 3D** permet d'explorer le terrain, les bâtiments et la végétation à partir des données LiDAR et des modèles numériques de terrain.
- **Météo essentielle**, **Bilan thermique** et la **Fiche climat** fournissent une information localisée sur la situation météorologique, les prévisions et les évolutions climatiques du lieu.
- Le **Tableau de bord de l'eau** permet de suivre les cours d'eau, les crues, les étiages, les nappes souterraines ainsi que la qualité de l'eau et des sites de baignade.
- **Incendies, risque et consignes**, **Vigilance feu** et **Incendies, temps réel** mettent en relation les niveaux officiels de vigilance, les recommandations publiques et les détections thermiques satellitaires récentes.
- **Valfeu**, conçue pour un usage mobile sur le terrain, localise l'utilisateur et recherche les suspicions satellitaires de feu observées à proximité.
- **OLD, obligations légales de débroussaillement**, aide à préparer le périmètre indicatif à débroussailler en croisant la position d'un bâtiment, le cadastre, le zonage réglementaire et les données cartographiques.
- **Itinéraire poids lourd** propose un parcours adapté au gabarit connu du véhicule et signale les portions pour lesquelles les données ouvertes ne permettent pas une vérification complète.

Ces applications s'appuient sur la même infrastructure de localisation, de collecte, de cartographie et de documentation des données. Elles peuvent ainsi être enrichies ou complétées sans reconnecter séparément chaque source publique.

Autour de cette infrastructure commune, chaque application répond à une question concrète : comprendre un lieu, suivre une situation, préparer une intervention ou éclairer une décision.
`;
