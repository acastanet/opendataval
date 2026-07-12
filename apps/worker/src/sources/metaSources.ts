import type pg from "pg";
import { CATALOGUE_SOURCES, upsertSource } from "@opendata-vda/shared";

/**
 * Peuple la table meta.sources avec les sources déclarées dans CATALOGUE_SOURCES.
 * Ce job doit être exécuté une fois pour initialiser les métadonnées.
 */
export async function run(pool: pg.Pool): Promise<number> {
  let n = 0;
  for (const source of CATALOGUE_SOURCES) {
    await upsertSource(pool, {
      slug: source.slug,
      nom: source.nom,
      url: source.url,
      licence: source.licence,
      frequence: source.frequence,
    });
    n++;
  }
  return n;
}
