import type pg from "pg";

/**
 * Génère un `tile_id` au format `ODV-YYYY-NNNNNN` (`agent/mvp/02-TILE-CONTRACT.md`).
 *
 * `YYYY` documente l'année de création, elle ne borne pas le compteur : `NNNNNN` vient
 * d'une séquence PostgreSQL unique et jamais réinitialisée (`sites.tile_id_seq`, ADR-007),
 * ce qui évite la complexité d'une remise à zéro annuelle pour un identifiant qui n'a pas
 * besoin d'encoder les coordonnées.
 */
export async function genererTileId(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ nextval: string }>("select nextval('sites.tile_id_seq')");
  const valeur = rows[0]?.nextval;
  if (valeur === undefined) throw new Error("genererTileId : la séquence n'a renvoyé aucune valeur");

  const annee = new Date().getUTCFullYear();
  const compteur = valeur.padStart(6, "0");
  if (compteur.length > 6) throw new Error(`genererTileId : compteur ${valeur} dépasse six chiffres`);
  return `ODV-${annee}-${compteur}`;
}
