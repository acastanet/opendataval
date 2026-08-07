import type { OuvrageBss } from "../types.js";

/**
 * Documents dont la seule présence est valorisée (indice documentaire, jamais interprétée).
 * `COUPE-GEOLOGIQUE` est exclue de cette liste : elle est déjà comptée par
 * `has_geological_section_document` (+10) et ne doit pas être payée une seconde fois ici.
 */
const DOCUMENTS_COMPLEMENTAIRES = [
  "DOCUMENTATION-GEOLOGIQUE",
  "RAPPORT-GEOLOGUE-OFFICIEL",
  "COUPE-TECHNIQUE",
  "PETRO",
  "MINERALO",
  "STRUCTURE",
  "ANALYSE-CHIMIQUE-ROCHE",
  "PERMEABILITE",
];

const BONUS_DOCUMENTS_MAX = 7;
const POINTS_PAR_DOCUMENT = 2;

function bonusProfondeur(profondeurM: number | null): number {
  if (profondeurM === null) return 0;
  if (profondeurM <= 10) return 1;
  if (profondeurM <= 25) return 2;
  if (profondeurM <= 50) return 3;
  if (profondeurM <= 100) return 4;
  return 5;
}

function bonusDocumentsComplementaires(documents: string[]): number {
  const distincts = new Set(documents.filter((doc) => DOCUMENTS_COMPLEMENTAIRES.includes(doc)));
  return Math.min(distincts.size * POINTS_PAR_DOCUMENT, BONUS_DOCUMENTS_MAX);
}

/** Score géologique déterministe, 0–100. Le barème plafonne sans remise à l'échelle. */
export function geologicalValueScore(ouvrage: OuvrageBss): number {
  let score = 0;
  if (ouvrage.is_core_sample) score += 30;
  if (ouvrage.has_geological_section) score += 20;
  if (ouvrage.has_geological_section_document) score += 10;
  if (ouvrage.has_geological_section_scan) score += 5;
  if (ouvrage.is_sounding) score += 10;
  if (ouvrage.is_borehole) score += 8;
  if (ouvrage.profondeur_m !== null) score += 5;
  score += bonusProfondeur(ouvrage.profondeur_m);
  score += bonusDocumentsComplementaires(ouvrage.documents);
  return Math.min(score, 100);
}

/** Décroissance douce (non linéaire) : un ouvrage riche à 4,9 km peut dépasser une source à 1,5 km. */
export function proximityScore(distanceM: number): number {
  return 100 / (1 + (distanceM / 2500) ** 2);
}

export function baseScore(geologicalScore: number, proximity: number): number {
  return 0.7 * geologicalScore + 0.3 * proximity;
}
