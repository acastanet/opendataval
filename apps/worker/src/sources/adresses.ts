import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { get as httpsGet } from "node:https";
import type { IncomingMessage } from "node:http";
import type pg from "pg";
import { COMMUNES_EPCI, upsertObjetsEnLot, type ObjetInput } from "@opendata-vda/shared";

const URL_BAN = "https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-30.csv.gz";
const TAILLE_LOT = 1000;
const COLONNES_REQUISES = ["id", "code_insee", "lon", "lat", "numero", "nom_voie"] as const;
const COLONNES_OPTIONNELLES = ["rep", "code_postal", "code_insee", "nom_commune", "nom_ld"] as const;

const CODES_EPCI = new Set<string>(COMMUNES_EPCI.map((c) => c.codeInsee));

/**
 * Téléchargement via node:https plutôt que fetch() : l'implémentation undici de Node 22 échoue
 * (UND_ERR_SOCKET « other side closed ») sur ce serveur alors que node:https réussit sans problème.
 */
function telechargerFlux(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`adresses -> HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      resolve(res);
    }).on("error", reject);
  });
}

/** Adresses BAN des 15 communes de l'EPCI, filtrées depuis l'export départemental du Gard (CSV gzip streamé). */
export async function run(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ debut: Date }>("select now() as debut");
  const debut = rows[0]?.debut;
  if (!debut) throw new Error("adresses : horodatage de départ indisponible");

  const reponse = await telechargerFlux(URL_BAN);
  const flux = reponse.pipe(createGunzip());
  const lignes = createInterface({ input: flux, crlfDelay: Infinity });

  let index: Record<string, number> | null = null;
  const lot = new Map<string, ObjetInput>();
  let n = 0;

  const vider = async (): Promise<void> => {
    if (lot.size === 0) return;
    await upsertObjetsEnLot(pool, [...lot.values()]);
    lot.clear();
  };

  for await (const ligne of lignes) {
    const champs = ligne.split(";");

    if (!index) {
      index = Object.fromEntries(champs.map((nom, i) => [nom, i]));
      for (const nom of COLONNES_REQUISES) {
        if (index[nom] === undefined) throw new Error(`adresses : colonne ${nom} absente de l'entête BAN`);
      }
      continue;
    }

    const col = (nom: string): string => {
      const i = index![nom];
      return i === undefined ? "" : (champs[i] ?? "");
    };

    if (!CODES_EPCI.has(col("code_insee"))) continue;

    const id = col("id");
    const lon = Number(col("lon"));
    const lat = Number(col("lat"));
    if (!id || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const props: Record<string, string> = { numero: col("numero"), nom_voie: col("nom_voie") };
    for (const nom of COLONNES_OPTIONNELLES) {
      const v = col(nom);
      if (v) props[nom] = v;
    }

    lot.set(id, {
      couche: "adresse",
      externalId: id,
      props,
      geometry: { type: "Point", coordinates: [lon, lat] },
      sourceUrl: "https://adresse.data.gouv.fr",
    });
    n++;

    if (lot.size >= TAILLE_LOT) await vider();
  }
  await vider();

  await pool.query("delete from couches.objets where couche = 'adresse' and maj < $1", [debut]);
  return n;
}
