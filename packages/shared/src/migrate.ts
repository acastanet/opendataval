import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

export async function runMigrations(pool: pg.Pool, migrationsDir: string): Promise<void> {
  const client = await pool.connect();
  try {
    // L'API et le worker démarrent en parallèle : le verrou de session évite qu'ils appliquent
    // simultanément une même migration ou créent le schéma meta au même instant.
    await client.query("select pg_advisory_lock($1)", [4_286_106]);
    await client.query("create schema if not exists meta");
    await client.query(
      `create table if not exists meta.migrations (
         nom text primary key,
         applique_a timestamptz not null default now()
       )`,
    );

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query("select 1 from meta.migrations where nom = $1", [file]);
      if (rows.length > 0) continue;

      const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
      try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into meta.migrations (nom) values ($1)", [file]);
      await client.query("commit");
      console.log(`migration appliquée : ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`échec migration ${file} : ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [4_286_106]);
    client.release();
  }
}
