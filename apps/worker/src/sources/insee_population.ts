import type pg from "pg";
import { COMMUNES_EPCI, upsertIndicateurs, type IndicateurInput } from "@opendata-vda/shared";

/**
 * Population municipale historique (recensements INSEE) → series.indicateurs.
 * Première source « indicateur » : valide le socle de bout en bout (worker → API → île).
 *
 * INSEE publie la série historique par commune dans un fichier « base des populations
 * historiques » (format large : une ligne par commune, une colonne par millésime). Les
 * identifiants de fichier INSEE changent à chaque édition ; l'URL est donc configurable via
 * INSEE_POPULATION_CSV_URL. Le parseur tolère les deux conventions de colonnes rencontrées :
 *   - séries historiques : PMUN2019, PSDC1968, PTOT1962…
 *   - fichiers recensement : P21_POP (20xx), D68_POP (19xx).
 */

const INDICATEUR = "population_municipale";
const SOURCE = "insee_population";
const CODES_EPCI = new Set<string>(COMMUNES_EPCI.map((c) => c.codeInsee));

/** Déduit le millésime (période) d'un nom de colonne INSEE, ou null si ce n'est pas une population. */
export function anneeDeColonne(col: string): string | null {
  let m: RegExpExecArray | null;
  if ((m = /^(?:PMUN|PSDC|PTOT|POP)_?(\d{4})$/i.exec(col))) return m[1] ?? null;
  if ((m = /^([PD])(\d{2})_POP$/i.exec(col))) {
    const prefixe = (m[1] ?? "").toUpperCase();
    const yy = Number(m[2] ?? "0");
    return String(prefixe === "P" ? 2000 + yy : 1900 + yy);
  }
  return null;
}

/** Parse le CSV INSEE (large) et retourne les points pour les communes du territoire. */
export function parserPopulationCsv(texte: string): IndicateurInput[] {
  const lignes = texte.split(/\r?\n/).filter((l) => l.length > 0);
  const entete = lignes[0];
  if (entete === undefined) return [];

  const sep = entete.includes(";") ? ";" : ",";
  const entetes = entete.split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const idxCodgeo = entetes.findIndex((h) => /^CODGEO$/i.test(h));
  if (idxCodgeo === -1) return [];

  // Colonnes de population : { indice, période }
  const colonnesAnnee = entetes
    .map((h, i) => ({ i, annee: anneeDeColonne(h) }))
    .filter((c) => c.annee !== null) as Array<{ i: number; annee: string }>;
  if (colonnesAnnee.length === 0) return [];

  const points: IndicateurInput[] = [];
  for (let l = 1; l < lignes.length; l++) {
    const champs = (lignes[l] ?? "").split(sep).map((v) => v.trim().replace(/^"|"$/g, ""));
    const codgeo = champs[idxCodgeo];
    if (codgeo === undefined || !CODES_EPCI.has(codgeo)) continue;
    for (const { i, annee } of colonnesAnnee) {
      const brut = champs[i];
      if (brut === undefined || brut === "" || brut === "N/A - résultat non disponible") continue;
      const valeur = Number(brut.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(valeur)) continue;
      points.push({ indicateur: INDICATEUR, territoire: codgeo, periode: annee, valeur, source: SOURCE });
    }
  }
  return points;
}

export async function run(pool: pg.Pool): Promise<number> {
  const url = process.env.INSEE_POPULATION_CSV_URL;
  if (!url) {
    throw new Error(
      "INSEE_POPULATION_CSV_URL non défini — renseigner l'URL du fichier CSV des populations " +
        "historiques INSEE (l'identifiant de fichier INSEE change à chaque édition, cf. insee.fr).",
    );
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`INSEE population : HTTP ${res.status} sur ${url}`);
  const texte = await res.text();

  const points = parserPopulationCsv(texte);
  await upsertIndicateurs(pool, points);
  return points.length;
}
