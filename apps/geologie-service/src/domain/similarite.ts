import type { OuvrageBss } from "../types.js";

const SEUIL_CLUSTER_M = 200;
const SEUIL_PROFONDEUR_MIN_M = 5;
const SEUIL_PROFONDEUR_RATIO = 0.2;

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const ensembleA = new Set(a);
  const ensembleB = new Set(b);
  const intersection = [...ensembleA].filter((doc) => ensembleB.has(doc)).length;
  const union = new Set([...ensembleA, ...ensembleB]).size;
  return union === 0 ? 0 : intersection / union;
}

function profondeurProche(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  const seuil = Math.max(SEUIL_PROFONDEUR_MIN_M, SEUIL_PROFONDEUR_RATIO * Math.max(a, b));
  return Math.abs(a - b) <= seuil;
}

/**
 * Similarité déterministe entre deux ouvrages, dans [0, 1]. Un critère non renseigné des
 * deux côtés (mode d'exécution vide, profondeur inconnue, aucun document) ne compte jamais
 * comme une ressemblance : sinon les nombreuses sources sans aucune donnée se
 * ressembleraient artificiellement entre elles.
 */
export function similarite(a: OuvrageBss, b: OuvrageBss): number {
  let score = 0;

  const distance = Math.hypot(a.x_l93 - b.x_l93, a.y_l93 - b.y_l93);
  if (distance < SEUIL_CLUSTER_M) score += 0.4;

  if (a.nature_brgm && b.nature_brgm && a.nature_brgm.toUpperCase() === b.nature_brgm.toUpperCase()) {
    score += 0.15;
  }

  if (a.mode_execution && b.mode_execution && a.mode_execution.toUpperCase() === b.mode_execution.toUpperCase()) {
    score += 0.15;
  }

  score += 0.2 * jaccard(a.documents, b.documents);

  if (profondeurProche(a.profondeur_m, b.profondeur_m)) score += 0.1;

  return Math.min(score, 1);
}
