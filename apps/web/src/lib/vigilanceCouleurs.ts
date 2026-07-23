export type NiveauVigilance = "vert" | "jaune" | "orange" | "rouge" | "inconnu";

export const LIBELLES_NIVEAU: Record<NiveauVigilance, string> = {
  vert: "Vigilance normale",
  jaune: "Vigilance renforcée",
  orange: "Danger élevé",
  rouge: "Danger très élevé",
  inconnu: "Information en attente",
};

export const COULEUR_NIVEAU: Record<NiveauVigilance, string> = {
  vert: "#18794e",
  jaune: "#a56700",
  orange: "#bd4d11",
  rouge: "#ad2434",
  inconnu: "#687076",
};

// Teinte de fond pour le remplissage des massifs sur la carte (traits pleins, faible opacité).
export const COULEUR_CARTE_NIVEAU: Record<NiveauVigilance, string> = {
  vert: "#d7dcdf",
  jaune: "#f2c84b",
  orange: "#f28c00",
  rouge: "#c62828",
  inconnu: "#b8bec2",
};
