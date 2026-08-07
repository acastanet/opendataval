import type pg from "pg";

export interface PoolFactice {
  pool: pg.Pool;
  queries: Array<{ sql: string; values?: unknown[] }>;
}

/**
 * Faux pool PostgreSQL, calqué sur le motif de
 * `apps/worker/src/sources/meteo_stations.test.ts` : enregistre chaque requête et répond
 * juste assez pour exercer la logique métier sans base réelle.
 */
export function poolFactice(): PoolFactice {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  let sequence = 0;
  let idEvenement = 0;
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (/nextval/.test(sql)) {
        sequence += 1;
        return { rows: [{ nextval: String(sequence) }], rowCount: 1 };
      }
      if (/insert into sites\.evenements/.test(sql)) {
        idEvenement += 1;
        return { rows: [{ id: idEvenement }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Pool;
  return { pool, queries };
}
