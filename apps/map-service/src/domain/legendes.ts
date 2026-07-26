import {
  PALETTE_HYPSOMETRIQUE,
  REPRESENTATIONS_COUCHES,
  VIGILANCE_FEU,
} from "@opendata-vda/shared/carto";

export type Legende =
  | { id: string; type: "couche"; libelle: string; geometrie: string; couleur: string; cluster: boolean; tirets: boolean }
  | { id: "relief-hypsometrique"; type: "continue"; libelle: string; unite: "m"; paliers: readonly { altitude: number; couleur: string; libelle: string }[] }
  | { id: "vigilance-feu"; type: "categorielle"; libelle: string; niveaux: typeof VIGILANCE_FEU };

export interface EntreeIndexLegende {
  id: string;
  libelle: string;
  type: Legende["type"];
}

export function indexLegendes(): EntreeIndexLegende[] {
  const couches: EntreeIndexLegende[] = Object.values(REPRESENTATIONS_COUCHES).map((couche) => ({
    id: couche.slug,
    libelle: couche.libellePluriel,
    type: "couche",
  }));
  return [
    ...couches,
    { id: "relief-hypsometrique", libelle: "Altitude", type: "continue" },
    { id: "vigilance-feu", libelle: "Vigilance feu", type: "categorielle" },
  ];
}

export function trouverLegende(id: string): Legende | null {
  if (id === "relief-hypsometrique") return { id, type: "continue", libelle: "Altitude", unite: "m", paliers: PALETTE_HYPSOMETRIQUE };
  if (id === "vigilance-feu") return { id, type: "categorielle", libelle: "Vigilance feu", niveaux: VIGILANCE_FEU };
  const couche = REPRESENTATIONS_COUCHES[id];
  if (!couche) return null;
  return {
    id: couche.slug,
    type: "couche",
    libelle: couche.libellePluriel,
    geometrie: couche.geometrie,
    couleur: couche.couleur,
    cluster: couche.cluster,
    tirets: couche.tirets,
  };
}
