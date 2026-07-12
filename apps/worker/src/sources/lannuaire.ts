import type pg from "pg";
import { TERRITOIRE, upsertObjet } from "@opendata-vda/shared";

interface Adresse {
  latitude?: string | null;
  longitude?: string | null;
  nom_commune?: string | null;
}

interface Organisme {
  id: string;
  nom: string;
  sigle: string | null;
  type_organisme: string | null;
  /** L'API renvoie ce champ comme une chaîne JSON encodée, pas un tableau natif. */
  adresse?: string | null;
}

interface OdsRecords {
  total_count: number;
  results: Organisme[];
}

function parseAdresses(raw: string | null | undefined): Adresse[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Adresse[]) : [];
  } catch {
    return [];
  }
}

/** Services publics de la commune (mairie, CCAS, gendarmerie...) — Annuaire de l'administration. */
export async function run(pool: pg.Pool): Promise<number> {
  const url =
    `https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records` +
    `?where=code_insee_commune%3D%22${TERRITOIRE.commune.codeInsee}%22&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Annuaire administration -> HTTP ${res.status}`);
  const { results } = (await res.json()) as OdsRecords;

  let n = 0;
  for (const o of results) {
    const adresse = parseAdresses(o.adresse).find((a) => a.latitude && a.longitude);
    const lat = adresse?.latitude ? Number(adresse.latitude) : null;
    const lon = adresse?.longitude ? Number(adresse.longitude) : null;
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) continue;
    await upsertObjet(pool, {
      couche: "administration",
      externalId: o.id,
      props: { nom: o.nom, sigle: o.sigle, type: o.type_organisme },
      geometry: { type: "Point", coordinates: [lon, lat] },
      sourceUrl: "https://lannuaire.service-public.fr/",
    });
    n++;
  }
  return n;
}
