import type pg from "pg";
import type { EtatDalle, ManifesteDalle, StatutRevue } from "@opendata-vda/shared/dalle";
import { transitionerInstance } from "./instances.js";

/**
 * Revue et publication minimales (lot P6, `agent/mvp/08-BACKLOG.md`). Les trois actions
 * couvrent le cycle `generated → review_required → approved → published` de
 * `02-TILE-CONTRACT.md` ; `transitionValide` (`packages/shared/src/dalle.ts`) empêche déjà
 * structurellement toute publication qui n'aurait pas transité par une revue approuvée —
 * cette couche ne fait que nommer les trois décisions possibles et exiger l'identité de
 * l'opérateur pour les deux qui en sont une.
 */
export type ActionRevue = "submit" | "approve" | "request_changes";

export interface DecisionRevue {
  reviewedBy?: string | null;
  notes?: string | null;
}

const CIBLE_ACTION: Record<ActionRevue, { versEtat: EtatDalle; revue: StatutRevue }> = {
  submit: { versEtat: "review_required", revue: "pending" },
  approve: { versEtat: "approved", revue: "approved" },
  request_changes: { versEtat: "collecting", revue: "changes_requested" },
};

export async function traiterRevue(
  pool: pg.Pool,
  instancesDir: string,
  tileId: string,
  action: ActionRevue,
  decision: DecisionRevue = {},
): Promise<ManifesteDalle> {
  const cible = CIBLE_ACTION[action];
  return transitionerInstance(pool, instancesDir, tileId, {
    versEtat: cible.versEtat,
    revue: cible.revue,
    reviewedBy: decision.reviewedBy,
    notes: decision.notes,
  });
}

/**
 * `transitionValide` refuse déjà `published` tant que `review.status` n'est pas `approved`
 * (voir son en-tête dans `dalle.ts`) : aucune vérification supplémentaire n'est nécessaire
 * ici pour empêcher une publication directe.
 */
export async function publierInstance(pool: pg.Pool, instancesDir: string, tileId: string): Promise<ManifesteDalle> {
  return transitionerInstance(pool, instancesDir, tileId, { versEtat: "published" });
}
