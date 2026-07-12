import type pg from "pg";
import { TERRITOIRE, upsertObjet } from "@opendata-vda/shared";

interface GeorisquesPage<T> {
  data: T[];
  next: string | null;
}

interface Cavite {
  identifiant: string;
  type: string;
  nom: string;
  reperage_geo: string | null;
  longitude: number | null;
  latitude: number | null;
}

interface Mouvement {
  identifiant: string;
  type: string;
  fiabilite: string | null;
  lieu: string | null;
  date_debut: string | null;
  precision_lieu: string | null;
  longitude: number | null;
  latitude: number | null;
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`Géorisques ${next} -> HTTP ${res.status}`);
    const page = (await res.json()) as GeorisquesPage<T>;
    results.push(...page.data);
    next = page.next;
  }
  return results;
}

const FICHE_RISQUES_URL = "https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi";

/** Cavités souterraines + mouvements de terrain (Géorisques/BRGM) sur la commune. */
export async function run(pool: pg.Pool): Promise<number> {
  let n = 0;
  const codeInsee = TERRITOIRE.commune.codeInsee;

  const cavites = await fetchAllPages<Cavite>(
    `https://www.georisques.gouv.fr/api/v1/cavites?code_insee=${codeInsee}&page_size=50`,
  );
  for (const c of cavites) {
    if (c.longitude == null || c.latitude == null) continue;
    await upsertObjet(pool, {
      couche: "cavite",
      externalId: c.identifiant,
      props: { nom: c.nom, type: c.type, reperage: c.reperage_geo },
      geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
      sourceUrl: FICHE_RISQUES_URL,
    });
    n++;
  }

  const mouvements = await fetchAllPages<Mouvement>(
    `https://www.georisques.gouv.fr/api/v1/mvt?code_insee=${codeInsee}&page_size=50`,
  );
  for (const m of mouvements) {
    if (m.longitude == null || m.latitude == null) continue;
    await upsertObjet(pool, {
      couche: "mouvement",
      externalId: m.identifiant,
      props: {
        type: m.type,
        fiabilite: m.fiabilite,
        lieu: m.lieu,
        date: m.date_debut,
        precision: m.precision_lieu,
      },
      geometry: { type: "Point", coordinates: [m.longitude, m.latitude] },
      sourceUrl: FICHE_RISQUES_URL,
    });
    n++;
  }

  return n;
}
