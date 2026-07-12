import type pg from "pg";

/**
 * Purge des observations infra-horaires (6 min, minute != 0) de plus de 30 jours dans
 * series.meteo_horaire — l'horaire (minute = 0) est conservé indéfiniment (~184k lignes/an, négligeable).
 */
export async function run(pool: pg.Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `delete from series.meteo_horaire
     where extract(minute from heure_utc) != 0
       and heure_utc < now() - interval '30 days'`,
  );
  return rowCount ?? 0;
}
