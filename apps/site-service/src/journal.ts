import type pg from "pg";

export type StatutEtape = "succes" | "echec";

/**
 * Journal de production (`agent/mvp/04-SITE-SERVICE.md` § « Journal de production ») :
 * une étape lancée, son début, sa fin, son succès/échec et l'erreur éventuelle.
 */
export async function demarrerEtape(pool: pg.Pool, tileId: string, etape: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `insert into sites.evenements (tile_id, etape) values ($1, $2) returning id`,
    [tileId, etape],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("demarrerEtape : insertion sans id retourné");
  return id;
}

export async function terminerEtape(pool: pg.Pool, id: number, statut: StatutEtape, erreur?: string): Promise<void> {
  await pool.query(
    `update sites.evenements set statut = $2, erreur = $3, termine_a = now() where id = $1`,
    [id, statut, erreur ?? null],
  );
}
