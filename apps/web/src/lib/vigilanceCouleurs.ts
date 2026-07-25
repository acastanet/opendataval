import {
  VIGILANCE_FEU,
  VIGILANCE_FEU_CONTOUR,
  VIGILANCE_FEU_TEXTE,
  type NiveauVigilanceFeu,
} from "@opendata-vda/shared/carto";

export type NiveauVigilance = NiveauVigilanceFeu;

const projeter = <T>(selection: (niveau: (typeof VIGILANCE_FEU)[NiveauVigilance]) => T): Record<NiveauVigilance, T> => ({
  blanc: selection(VIGILANCE_FEU.blanc),
  jaune: selection(VIGILANCE_FEU.jaune),
  orange: selection(VIGILANCE_FEU.orange),
  rouge: selection(VIGILANCE_FEU.rouge),
  inconnu: selection(VIGILANCE_FEU.inconnu),
});

export const LIBELLES_NIVEAU = projeter((niveau) => niveau.libelle);
export const LIBELLES_ACCES_NIVEAU = projeter((niveau) => niveau.acces);
export const COULEUR_PASTILLE_NIVEAU = projeter((niveau) => niveau.couleurPastille);
export const COULEUR_CARTE_NIVEAU = projeter((niveau) => niveau.couleurCarte);
export const OPACITE_CARTE_NIVEAU = projeter((niveau) => niveau.opacite);
export const LARGEUR_CONTOUR_NIVEAU = projeter((niveau) => niveau.largeurContour);
export const CONTOUR_CARTE_NIVEAU = VIGILANCE_FEU_CONTOUR;
export const TEXTE_SUR_NIVEAU = VIGILANCE_FEU_TEXTE;
