import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { get as httpsGet } from "node:https";
import type { IncomingMessage } from "node:http";
import type pg from "pg";
import { TERRITOIRE, upsertMeteoQuotidien, type MeteoQuotidienInput } from "@opendata-vda/shared";

// Dataset Météo-France « Données climatologiques de base quotidiennes » sur data.gouv.fr.
const DATASET_ID = "6569b51ae64326786e4e8e1a";
const DEPARTEMENT = "30";
const NUM_POSTE: string = TERRITOIRE.stationMeteo.numPoste;
const TAILLE_LOT = 1000;
// Titres de ressources du type "QUOT_departement_30_periode_1950-2024_RR-T-Vent" (millésimes glissants,
// à ne pas coder en dur : résolus dynamiquement via l'API data.gouv.fr à chaque exécution).
const TITRE_RESSOURCE = new RegExp(`^QUOT_departement_${DEPARTEMENT}_periode_(\\d{4})-(\\d{4})_RR-T-Vent$`);

/** Téléchargement via node:https (cf. adresses.ts : plus fiable que fetch() sur ces flux gzip volumineux). */
function telechargerFlux(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`meteo_climat ${url} -> HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      resolve(res);
    }).on("error", reject);
  });
}

async function resoudreRessources(): Promise<string[]> {
  const res = await fetch(`https://www.data.gouv.fr/api/1/datasets/${DATASET_ID}/`, {
    headers: { "User-Agent": "opendata-vda-worker/1.0" },
  });
  if (!res.ok) throw new Error(`meteo_climat data.gouv -> HTTP ${res.status}`);
  const data = (await res.json()) as { resources: Array<{ title: string; url: string }> };

  const ressources = data.resources
    .map((r) => ({ url: r.url, m: TITRE_RESSOURCE.exec(r.title) }))
    .filter((x): x is { url: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map((x) => x.url);

  if (ressources.length === 0) {
    throw new Error(`meteo_climat : aucun fichier RR-T-Vent trouvé pour le département ${DEPARTEMENT}`);
  }
  return ressources;
}

async function ingererFichier(pool: pg.Pool, url: string): Promise<number> {
  const reponse = await telechargerFlux(url);
  const flux = reponse.pipe(createGunzip());
  const lignes = createInterface({ input: flux, crlfDelay: Infinity });

  let index: Record<string, number> | null = null;
  let lot: MeteoQuotidienInput[] = [];
  let n = 0;

  const vider = async (): Promise<void> => {
    if (lot.length === 0) return;
    await upsertMeteoQuotidien(pool, NUM_POSTE, lot);
    lot = [];
  };

  for await (const ligne of lignes) {
    const champs = ligne.split(";");

    if (!index) {
      index = Object.fromEntries(champs.map((nom, i) => [nom.trim(), i]));
      continue;
    }

    const col = (nom: string): string => {
      const i = index![nom];
      return i === undefined ? "" : (champs[i] ?? "").trim();
    };

    if (col("NUM_POSTE") !== NUM_POSTE) continue;

    const brut = col("AAAAMMJJ");
    if (brut.length !== 8) continue;
    const date = `${brut.slice(0, 4)}-${brut.slice(4, 6)}-${brut.slice(6, 8)}`;
    const num = (s: string): number | null => (s === "" ? null : Number(s));

    lot.push({ date, rr: num(col("RR")), tn: num(col("TN")), tx: num(col("TX")), tm: num(col("TM")) });
    n++;
    if (lot.length >= TAILLE_LOT) await vider();
  }
  await vider();

  return n;
}

/** Séries climatologiques quotidiennes du mont Aigoual, 1950→aujourd'hui (meteo.data.gouv.fr, CSV gzip). */
export async function run(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ max: Date | null }>(
    "select max(date) as max from series.meteo_quotidien where num_poste = $1",
    [NUM_POSTE],
  );
  const dejaAlimente = rows[0]?.max != null;

  const urls = await resoudreRessources();
  // Une fois l'historique initialisé, ne retélécharger que le fichier le plus récent (« latest »).
  const aTelecharger = dejaAlimente ? urls.slice(-1) : urls;

  let n = 0;
  for (const url of aTelecharger) {
    n += await ingererFichier(pool, url);
  }
  return n;
}
