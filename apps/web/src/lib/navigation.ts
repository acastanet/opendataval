import { SECTIONS } from "@opendata-vda/shared/sections";
import { applicationLinks, apiLinks, type LandingLink } from "./landing";

export interface GroupeNavigation {
  id: string;
  titre: string;
  liens: LandingLink[];
}

/**
 * Ordre d'affichage des applications dans le panneau de navigation.
 * Il suit la lecture de la landing : entrées majeures d'abord, puis les usages
 * thématiques. Les libellés et descriptions restent ceux de `landing.ts` :
 * une seule source de vérité pour les applications du portail.
 */
const ORDRE_APPLICATIONS = [
  "carte",
  "relief",
  "meteo-essentiel",
  "meteo-bilan-thermique",
  "climat",
  "eau-tableau-de-bord",
  "incendies",
  "vigilance-feu",
  "incendies-temps-reel",
  "valfeu",
  "old",
  "itineraire-poids-lourd",
  "lavgeol",
];

export interface AncreAccueil {
  id: string;
  numero: string;
  titre: string;
}

/**
 * Sommaire de la page d'accueil. Il sert à la fois aux en-têtes de section de
 * `pages/index.astro` et aux ancres que la barre permanente révèle une fois le
 * hero franchi : les deux ne peuvent donc pas diverger.
 */
export const ANCRES_ACCUEIL: AncreAccueil[] = [
  { id: "projet", numero: "01", titre: "Le projet" },
  { id: "demarche", numero: "02", titre: "La démarche" },
  { id: "applications", numero: "03", titre: "Les applications" },
];

function normaliser(chemin: string): string {
  const sansSlash = chemin.replace(/\/+$/, "");
  return sansSlash === "" ? "/" : sansSlash;
}

const applicationsPanneau: LandingLink[] = ORDRE_APPLICATIONS.map((id) => {
  const application = applicationLinks.find((lien) => lien.id === id);
  if (!application) throw new Error(`Application de navigation inconnue : ${id}`);
  return application;
});

// `sources` figure au catalogue des thèmes mais n'a pas de page dédiée : la
// barre ne doit pas proposer une destination qui n'existe pas.
const rubriques: LandingLink[] = SECTIONS.filter((section) => section.slug !== "sources").map((section) => ({
  id: `rubrique-${section.slug}`,
  name: section.titre,
  description: section.description,
  href: `/${section.slug}/`,
}));

/** Les trois groupes du panneau « Applications » de la barre permanente. */
export const GROUPES_NAVIGATION: GroupeNavigation[] = [
  { id: "applications", titre: "Applications", liens: applicationsPanneau },
  { id: "rubriques", titre: "Rubriques de données", liens: rubriques },
  // Le catalogue complet des démonstrations vit dans `apiLinks` ; la barre n'en
  // expose que les deux portes d'entrée, le reste se découvre depuis /api/v2.
  { id: "services", titre: "Services & API", liens: apiLinks.filter((lien) => lien.id.startsWith("api-v2")) },
];

/**
 * Titre de la page courante pour le fil d'Ariane, déduit du chemin.
 * Renvoie `undefined` quand la page n'est pas répertoriée : le fil d'Ariane se
 * réduit alors à la marque, plutôt que d'afficher un libellé inventé.
 */
export function titrePageCourante(pathname: string): string | undefined {
  const chemin = normaliser(pathname);
  const application = applicationLinks.find((lien) => normaliser(lien.href) === chemin);
  if (application) return application.name;
  const rubrique = SECTIONS.find((section) => normaliser(`/${section.slug}`) === chemin);
  return rubrique?.titre;
}

/** Vrai si le lien correspond à la page consultée (marquage `aria-current`). */
export function estPageCourante(href: string, pathname: string): boolean {
  return normaliser(href) === normaliser(pathname);
}
