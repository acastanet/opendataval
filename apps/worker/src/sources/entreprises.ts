import type pg from "pg";
import { COMMUNES_EPCI, upsertObjetsEnLot, type ObjetInput } from "@opendata-vda/shared";

const PER_PAGE = 25;
const TAILLE_LOT = 500;

interface Etablissement {
  siret: string;
  etat_administratif: string;
  statut_diffusion_etablissement: string;
  latitude: string | null;
  longitude: string | null;
  activite_principale: string | null;
  date_creation: string | null;
  libelle_commune: string | null;
  liste_enseignes: string[] | null;
}

interface Entreprise {
  nom_complet: string;
  siege: Etablissement;
  matching_etablissements?: Etablissement[];
}

interface RechercheEntreprisesReponse {
  results: Entreprise[];
  total_pages: number;
}

/**
 * Établissements SIRENE actifs des 15 communes de l'EPCI (recherche-entreprises.api.gouv.fr).
 * Un appel par commune (l'API n'accepte qu'un seul code_commune), paginé. On itère sur
 * matching_etablissements (granularité SIRET) plutôt que sur le siège de l'entreprise : une
 * entreprise dont le siège est ailleurs peut avoir un établissement actif sur le territoire
 * (ex. bureau de poste local d'une entreprise nationale), et une même entreprise locale peut avoir
 * plusieurs établissements distincts dans la commune.
 */
export async function run(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ debut: Date }>("select now() as debut");
  const debut = rows[0]?.debut;
  if (!debut) throw new Error("entreprises : horodatage de départ indisponible");

  const lot = new Map<string, ObjetInput>();
  let n = 0;

  const vider = async (): Promise<void> => {
    if (lot.size === 0) return;
    await upsertObjetsEnLot(pool, [...lot.values()]);
    lot.clear();
  };

  for (const commune of COMMUNES_EPCI) {
    let page = 1;
    let totalPages = 1;
    do {
      const url =
        `https://recherche-entreprises.api.gouv.fr/search?code_commune=${commune.codeInsee}` +
        `&etat_administratif=A&per_page=${PER_PAGE}&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Recherche entreprises (${commune.codeInsee}) -> HTTP ${res.status}`);
      const { results, total_pages } = (await res.json()) as RechercheEntreprisesReponse;
      totalPages = total_pages;

      for (const entreprise of results) {
        const etablissements = entreprise.matching_etablissements?.length
          ? entreprise.matching_etablissements
          : [entreprise.siege];

        for (const etab of etablissements) {
          // Établissement fermé (l'entreprise peut être active nationalement sans que cet
          // établissement précis le soit encore) ou coordonnées non diffusables (RGPD).
          if (etab.etat_administratif !== "A" || etab.statut_diffusion_etablissement === "P") continue;
          const lon = Number(etab.longitude);
          const lat = Number(etab.latitude);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

          lot.set(etab.siret, {
            couche: "entreprise",
            externalId: etab.siret,
            props: {
              nom: entreprise.nom_complet,
              siret: etab.siret,
              naf: etab.activite_principale,
              enseigne: etab.liste_enseignes?.[0] ?? null,
              dateCreation: etab.date_creation,
              commune: etab.libelle_commune,
            },
            geometry: { type: "Point", coordinates: [lon, lat] },
            sourceUrl: `https://annuaire-entreprises.data.gouv.fr/etablissement/${etab.siret}`,
          });
          n++;
          if (lot.size >= TAILLE_LOT) await vider();
        }
      }
      page++;
    } while (page <= totalPages);
  }
  await vider();

  await pool.query("delete from couches.objets where couche = 'entreprise' and maj < $1", [debut]);
  return n;
}
