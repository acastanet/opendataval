import { COUCHES } from "./catalogue.js";

export type FondCartographique = "plan" | "photo" | "satellite";
export type NiveauVigilanceFeu = "blanc" | "jaune" | "orange" | "rouge" | "inconnu";

export interface DescripteurFond {
  id: FondCartographique;
  libelle: string;
  coucheIgn: string;
  format: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
  attribution: string;
}

export const FONDS_CARTOGRAPHIQUES: readonly DescripteurFond[] = [
  { id: "plan", libelle: "Plan IGN", coucheIgn: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", format: "image/png", extension: "png", attribution: "© IGN" },
  { id: "photo", libelle: "Photographie aérienne", coucheIgn: "ORTHOIMAGERY.ORTHOPHOTOS", format: "image/jpeg", extension: "jpg", attribution: "© IGN" },
  { id: "satellite", libelle: "Satellite SPOT", coucheIgn: "ORTHOIMAGERY.ORTHO-SAT.SPOT.2022", format: "image/jpeg", extension: "jpg", attribution: "© IGN" },
] as const;

export const GEOLOGIE = { id: "geologie", libelle: "Carte géologique", couche: "SCAN_D_GEOL50", attribution: "© BRGM" } as const;

export const RELIEF_BOUNDS = [3.2, 43.8, 4.1, 44.4] as const;
export const RELIEF_GLOBAL_MAXZOOM = 12;
export const RELIEF_HD_MINZOOM = 13;
export const RELIEF_MAXZOOM = 15;
export const RELIEF_ATTRIBUTION = '© <a href="https://mapterhorn.com/attribution">Mapterhorn</a>';

export const PALETTE_HYPSOMETRIQUE = [
  { altitude: 150, couleur: "#2c5a2c", libelle: "150 m" },
  { altitude: 400, couleur: "#4a7a3a", libelle: "400 m" },
  { altitude: 650, couleur: "#7a9a4a", libelle: "650 m" },
  { altitude: 900, couleur: "#b8a95a", libelle: "900 m" },
  { altitude: 1150, couleur: "#c98f4e", libelle: "1 150 m" },
  { altitude: 1350, couleur: "#a86b42", libelle: "1 350 m" },
  { altitude: 1567, couleur: "#d8c4a8", libelle: "1 567 m" },
] as const;

export const VIGILANCE_FEU = {
  blanc: { libelle: "Blanc", acces: "Accès autorisé", couleurPastille: "#ffffff", couleurCarte: "#ffffff", opacite: 0, largeurContour: 3 },
  jaune: { libelle: "Jaune", acces: "Accès autorisé", couleurPastille: "#ffff80", couleurCarte: "#ffff00", opacite: 0.5, largeurContour: 2 },
  orange: { libelle: "Orange", acces: "Accès déconseillé", couleurPastille: "#ff854a", couleurCarte: "#ffa500", opacite: 0.7, largeurContour: 2 },
  rouge: { libelle: "Rouge", acces: "Accès interdit", couleurPastille: "#ff3e3e", couleurCarte: "#ff0000", opacite: 0.7, largeurContour: 2 },
  inconnu: { libelle: "Non publié", acces: "Consultez la carte officielle", couleurPastille: "#808285", couleurCarte: "#808285", opacite: 0.35, largeurContour: 2 },
} as const satisfies Record<NiveauVigilanceFeu, {
  libelle: string;
  acces: string;
  couleurPastille: string;
  couleurCarte: string;
  opacite: number;
  largeurContour: number;
}>;

export const VIGILANCE_FEU_CONTOUR = "#000000";
export const VIGILANCE_FEU_TEXTE = "#1a1a1a";

export interface RepresentationCouche {
  slug: string;
  libelle: string;
  libellePluriel: string;
  geometrie: "point" | "polygone";
  couleur: string;
  cluster: boolean;
  tirets: boolean;
}

export const REPRESENTATIONS_COUCHES = Object.fromEntries(
  COUCHES.map((couche) => [
    couche.slug,
    {
      slug: couche.slug,
      libelle: couche.libelle,
      libellePluriel: couche.libellePluriel,
      geometrie: couche.geometrie,
      couleur: couche.couleur,
      cluster: "cluster" in couche && couche.cluster === true,
      tirets: "tirets" in couche && couche.tirets === true,
    } satisfies RepresentationCouche,
  ]),
) as Record<string, RepresentationCouche>;

export const IDS_CARTOGRAPHIQUES = {
  sources: { plan: "fond-plan-src", photo: "fond-photo-src", satellite: "fond-satellite-src", geologie: "geologie-src", relief: "relief-dem-src" },
  couches: { plan: "basemap-plan", photo: "basemap-photo", satellite: "basemap-satellite", geologie: "geologie-layer", hillshade: "relief-hillshade", reliefCouleur: "relief-color" },
} as const;

export function prefixerId(id: string, prefixe?: string): string {
  return prefixe ? `${prefixe}-${id}` : id;
}

export function cheminFrameValide(path: string): boolean {
  return /^\/v2\/radar\/(nowcast\/)?[0-9a-f]+$/.test(path);
}

export function urlTuileRadarAmont(path: string, z: number, x: number, y: number): string {
  return `https://tilecache.rainviewer.com${path}/256/${z}/${x}/${y}/2/1_1.png`;
}

export function gabaritTuilesRadar(path: string): string {
  return `/api/v2/map/tiles/radar/{z}/{x}/{y}.png?path=${encodeURIComponent(path)}`;
}
