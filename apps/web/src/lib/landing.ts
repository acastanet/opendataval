import { SECTIONS } from "@opendata-vda/shared/sections";

export interface LandingLink {
  id: string;
  name: string;
  description: string;
  href: string;
  route?: string;
}

export const applicationLinks: LandingLink[] = [
  { id: "incendies", name: "Incendies — risque & consignes", description: "Recommandations officielles incendie pour les massifs gardois autour de l’Aigoual.", href: "/incendies/" },
  { id: "incendies-temps-reel", name: "Incendies — temps réel & méthodologie", description: "Détections thermiques NASA FIRMS et périmètres de veille autour de l’Aigoual.", href: "/incendies/temps-reel/" },
  { id: "vigilance-feu", name: "Vigilance incendie", description: "Couleur d’alerte du massif et carte des anomalies thermiques du département du Gard.", href: "/vigilance-feu/" },
  { id: "eau", name: "Eau — rivière, crues & nappe", description: "Parcours didactique en carte 3D : le voyage de l’eau, de l’Aigoual à la Méditerranée.", href: "/eau/" },
  { id: "eau-tableau-de-bord", name: "Eau — tableau de bord", description: "Quantité, crues, étiages, nappes, qualité physico-chimique et baignade.", href: "/eau/tableau-de-bord/" },
  { id: "carte", name: "Carte du territoire", description: "Carte interactive des données ouvertes : géologie, sous-sol, eau, nature et services publics.", href: "/carte/" },
  { id: "relief", name: "Relief 3D", description: "Teinte hypsométrique et ombrage calculés depuis le MNT Copernicus GLO-30 et le LiDAR HD IGN.", href: "/relief/" },
  { id: "lavgeol", name: "Lavgeol — Explorateur géologique", description: "Carte géologique interactive, fonds IGN et relief 3D, avec recherche des ouvrages du sous-sol (BSS BRGM) à proximité.", href: "/lavgeol/" },
  { id: "valleraugue-3d", name: "Jumeau numérique 3D — POC Valleraugue", description: "Maquette LiDAR en quatre vues à caméra commune : sol nu, végétation, nuage source et vue superposée.", href: "/valleraugue-3d/" },
  { id: "meteo", name: "Météo", description: "Prévision localisée à une adresse, un lieu-dit ou une position GPS dans Val-d’Aigoual.", href: "/meteo/" },
  { id: "meteo-essentiel", name: "Météo essentielle", description: "Position GPS, situation actuelle, risque à venir et prévisions utiles.", href: "/meteo/essentiel/" },
  { id: "meteo-bilan-thermique", name: "Météo — bilan thermique", description: "Stress thermique UTCI et nuits tropicales du dernier mois complet, via Copernicus ERA5-HEAT.", href: "/meteo/bilan-thermique/" },
  { id: "climat", name: "Fiche climat", description: "Normales, saisons thermiques et évolutions climatiques observées au lieu consulté.", href: "/climat/" },
  { id: "meteo-comparaison", name: "Météo — comparaison", description: "Prévisions de J−1 confrontées à leur version actualisée à J, sans les confondre avec des observations.", href: "/meteo/comparaison/" },
  { id: "meteo-informations", name: "Météo — informations", description: "Informations d’usage, limites et sources de la météo essentielle.", href: "/meteo/informations/" },
  { id: "meteo-v2", name: "Météo v2", description: "Interface v2 adossée au gateway : température et provenance exacte de la mesure affichée.", href: "/meteo-v2/" },
  { id: "old", name: "OLD — Obligations légales de débroussaillement", description: "Zonage OLD et périmètre indicatif de débroussaillement depuis le bâtiment, le cadastre et le PLU.", href: "/old/" },
  { id: "itineraire-poids-lourd", name: "Itinéraire poids lourd", description: "Itinéraire camion selon le gabarit connu dans OpenStreetMap, avec les portions à vérifier signalées.", href: "/itineraire-poids-lourd/" },
  { id: "valfeu", name: "LAV.feu — Veille incendie", description: "Application mobile de terrain : position, carte et suspicions satellitaires de feu à proximité.", href: "/valfeu" },
];

export const themeLinks: LandingLink[] = SECTIONS.filter((section) => section.slug !== "sources").map((section) => ({
  id: `theme-${section.slug}`,
  name: section.titre,
  description: section.description,
  href: `/${section.slug}/`,
}));

export const apiLinks: LandingLink[] = [
  { id: "api-v2", name: "Accueil des services v2", description: "Catalogue des microservices, de leurs rôles et de leurs routes publiques.", href: "/api/v2", route: "/api/v2" },
  { id: "api-v2-status", name: "État des services v2", description: "État de santé en direct du gateway et de chaque microservice.", href: "/api/v2/status", route: "/api/v2/status" },
  { id: "gateway", name: "Gateway", description: "Façade HTTP unique : validation des paramètres et normalisation des réponses.", href: "/api/v2/gateway", route: "/api/v2/gateway" },
  { id: "gateway-demo", name: "Démo — Gateway", description: "Découvrir le rôle de la façade HTTP et tester son point d’entrée public.", href: "/api/v2/demo/gateway", route: "/api/v2/gateway" },
  { id: "map", name: "Démo — Map", description: "Tester les styles, les fonds, le relief et les légendes cartographiques.", href: "/api/v2/demo/map", route: "/api/v2/map/styles/carte.json" },
  { id: "geography", name: "Démo — Geography", description: "Retrouver commune, département et altitude à partir de coordonnées.", href: "/api/v2/demo/geography", route: "/api/v2/geography/resolve" },
  { id: "weather", name: "Démo — Weather", description: "Obtenir une température ponctuelle et son contexte territorial.", href: "/api/v2/demo/weather", route: "/api/v2/weather/temperature" },
  { id: "vigilance", name: "Démo — Weather Vigilance", description: "Consulter la vigilance météorologique officielle d’un département.", href: "/api/v2/demo/vigilance", route: "/api/v2/vigilance" },
  { id: "fire", name: "Démo — Fire Detection", description: "Chercher les suspicions satellitaires de feu autour d’un point.", href: "/api/v2/demo/fire", route: "/api/v2/fire/nearby" },
  { id: "associations", name: "Démo — Associations", description: "Rechercher et cartographier les associations d’une commune.", href: "/api/v2/demo/associations", route: "/api/v2/associations" },
  { id: "old-api", name: "Démo — OLD", description: "Vérifier l’applicabilité des obligations de débroussaillement.", href: "/api/v2/demo/old", route: "/api/v2/old/perimetre" },
  { id: "itineraire-api", name: "Démo — Itinéraire poids lourd", description: "Tester un parcours camion et les restrictions connues.", href: "/api/v2/demo/itineraire-poids-lourd", route: "/api/v2/itineraire/poids-lourd" },
  { id: "geologie", name: "Démo — Géologie BSS BRGM", description: "Trouver les ouvrages géologiques pertinents autour d’un lieu.", href: "/api/v2/demo/geologie", route: "/api/v2/geologie/bss/proches" },
  { id: "legacy", name: "Démo — Legacy", description: "Interroger en lecture seule les routes de l’API historique.", href: "/api/v2/demo/legacy", route: "/api/v2/legacy/*" },
];

export function findApplication(id: string): LandingLink {
  const application = applicationLinks.find((link) => link.id === id);
  if (!application) throw new Error(`Application de landing inconnue : ${id}`);
  return application;
}
