import type pg from "pg";
import { TERRITOIRE, upsertObjet } from "@opendata-vda/shared";

interface Etablissement {
  identifiant_de_l_etablissement: string;
  nom_etablissement: string;
  type_etablissement: string;
  statut_public_prive: string | null;
  adresse_1: string | null;
  code_postal: string | null;
  nom_commune: string | null;
  position?: { lon: number; lat: number } | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface OdsRecords {
  total_count: number;
  results: Etablissement[];
}

/** Écoles/établissements scolaires de la commune (Annuaire de l'éducation, ODS v2.1). */
export async function run(pool: pg.Pool): Promise<number> {
  const url =
    `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records` +
    `?where=code_commune%3D%22${TERRITOIRE.commune.codeInsee}%22&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Annuaire éducation -> HTTP ${res.status}`);
  const { results } = (await res.json()) as OdsRecords;

  let n = 0;
  for (const e of results) {
    const lon = e.position?.lon ?? e.longitude;
    const lat = e.position?.lat ?? e.latitude;
    if (lon == null || lat == null) continue;
    await upsertObjet(pool, {
      couche: "ecole",
      externalId: e.identifiant_de_l_etablissement,
      props: {
        nom: e.nom_etablissement,
        type: e.type_etablissement,
        statut: e.statut_public_prive,
        adresse: e.adresse_1,
        commune: e.nom_commune,
      },
      geometry: { type: "Point", coordinates: [lon, lat] },
      sourceUrl: "https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/",
    });
    n++;
  }
  return n;
}
