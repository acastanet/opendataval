export type NiveauVigilance = "blanc" | "jaune" | "orange" | "rouge" | "inconnu";

export const LIBELLES_NIVEAU: Record<NiveauVigilance, string> = {
  blanc: "Blanc",
  jaune: "Jaune",
  orange: "Orange",
  rouge: "Rouge",
  inconnu: "Non publié",
};

// Conséquence officielle du niveau, telle qu'affichée dans les popups de massif
// de risque-prevention-incendie.fr/gard/ (massifs_prev.js, onEachMassifs).
export const LIBELLES_ACCES_NIVEAU: Record<NiveauVigilance, string> = {
  blanc: "Accès autorisé",
  jaune: "Accès autorisé",
  orange: "Accès déconseillé",
  rouge: "Accès interdit",
  inconnu: "Consultez la carte officielle",
};

// Couleurs exactes des pastilles de légende officielles (static/30/img/legende_*.png),
// utilisées pour le bandeau de niveau et la légende de carte.
export const COULEUR_PASTILLE_NIVEAU: Record<NiveauVigilance, string> = {
  blanc: "#ffffff",
  jaune: "#ffff80",
  orange: "#ff854a",
  rouge: "#ff3e3e",
  inconnu: "#808285",
};

// Couleurs de remplissage des massifs sur la carte officielle Leaflet
// (static/30/js/massifs_prev.js, styleMassifs).
export const COULEUR_CARTE_NIVEAU: Record<NiveauVigilance, string> = {
  blanc: "#ffffff",
  jaune: "#ffff00",
  orange: "#ffa500",
  rouge: "#ff0000",
  inconnu: "#808285",
};

// Opacité de remplissage par niveau (styleMassifs) : le blanc n'est pas rempli.
export const OPACITE_CARTE_NIVEAU: Record<NiveauVigilance, number> = {
  blanc: 0,
  jaune: 0.5,
  orange: 0.7,
  rouge: 0.7,
  inconnu: 0.35,
};

// Contour noir des massifs, plus épais au niveau blanc (styleMassifs : weight 3 vs 2).
export const CONTOUR_CARTE_NIVEAU = "#000000";
export const LARGEUR_CONTOUR_NIVEAU: Record<NiveauVigilance, number> = {
  blanc: 3,
  jaune: 2,
  orange: 2,
  rouge: 2,
  inconnu: 2,
};

// Couleur de texte posée sur un bandeau/fond de niveau (tous les fonds de
// COULEUR_PASTILLE_NIVEAU sont clairs, y compris le rouge #ff3e3e).
export const TEXTE_SUR_NIVEAU = "#1a1a1a";
