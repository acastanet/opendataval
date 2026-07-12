import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

export async function runMigrations(pool: pg.Pool, migrationsDir: string): Promise<void> {
  await pool.query("create schema if not exists meta");
  await pool.query(
    `create table if not exists meta.migrations (
       nom text primary key,
       applique_a timestamptz not null default now()
     )`,
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query("select 1 from meta.migrations where nom = $1", [file]);
    if (rows.length > 0) continue;

    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into meta.migrations (nom) values ($1)", [file]);
      await client.query("commit");
      console.log(`migration appliquée : ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`échec migration ${file} : ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
