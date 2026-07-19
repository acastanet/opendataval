import type pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";

const GARD_BASE_URL = "https://www.risque-prevention-incendie.fr/static/30/import_data";
const MAX_TENTATIVES = 2;

const MASSIFS = [
  { id: "301", nom: "CAUSSE AIGOUAL" },
  { id: "302", nom: "SUD CEVENNES" },
  { id: "303", nom: "NORD CEVENNES" },
] as const;

interface GardFile {
  massifs?: Record<string, [number, number]>;
}

interface GardDailyRisk {
  data: GardFile;
  modeCollecte: "automatique" | "manuel";
}

async function lireFichierSecours(date: string): Promise<GardDailyRisk | null> {
  const dossier = process.env.FIRE_RISK_GARD_FALLBACK_DIR;
  if (!dossier) return null;
  try {
    const contenu = await readFile(path.join(dossier, `${date.replaceAll("-", "")}.json`), "utf-8");
    return { data: JSON.parse(contenu) as GardFile, modeCollecte: "manuel" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw new Error(`Risque incendie Gard ${date} : fichier de secours illisible`);
  }
}

function parisDate(offsetDays: number): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const base = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function niveau(value: number): "vert" | "jaune" | "orange" | "rouge" | "inconnu" {
  if (value === 1) return "vert";
  if (value === 2) return "jaune";
  if (value === 3) return "orange";
  if (value === 4) return "rouge";
  return "inconnu";
}

async function fetchDailyRisk(date: string): Promise<GardDailyRisk | null> {
  const compactDate = date.replaceAll("-", "");
  let derniereErreur: Error | null = null;
  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative += 1) {
    try {
      const response = await fetch(`${GARD_BASE_URL}/${compactDate}.json`, {
        headers: { "User-Agent": "OpenDataVdA/1.0 (+https://opendata.valdaigoual.fr)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return await lireFichierSecours(date);
      if (!response.ok) throw new Error(`Risque incendie Gard ${date} -> HTTP ${response.status}`);
      return { data: (await response.json()) as GardFile, modeCollecte: "automatique" };
    } catch (error) {
      derniereErreur = error as Error;
      if (tentative < MAX_TENTATIVES) await new Promise((resolve) => setTimeout(resolve, 500 * tentative));
    }
  }
  const secours = await lireFichierSecours(date);
  if (secours) return secours;
  throw derniereErreur ?? new Error(`Risque incendie Gard ${date} indisponible`);
}

async function saveRisk(pool: pg.Pool, date: string, risque: GardDailyRisk): Promise<number> {
  const { data } = risque;
  const values = MASSIFS.flatMap((massif) => {
    const entry = data.massifs?.[massif.id];
    return entry === undefined ? [] : [{ massif, level: niveau(entry[0]) }];
  });
  if (values.length !== MASSIFS.length) {
    throw new Error(`Risque incendie Gard ${date} : ${values.length}/${MASSIFS.length} massifs attendus`);
  }

  const sourceUrl = `${GARD_BASE_URL}/${date.replaceAll("-", "")}.json`;
  for (const value of values) {
    await pool.query(
       `insert into incendies.risques_officiels
         (date_validite, departement, zone_officielle, niveau, restrictions, source_url, archive_brute, mode_collecte)
       values ($1::date, 'Gard', $2, $3, null, $4, $5, $6)
       on conflict (date_validite, departement, zone_officielle) do update set
         niveau = excluded.niveau, restrictions = excluded.restrictions,
         source_url = excluded.source_url, archive_brute = excluded.archive_brute,
         mode_collecte = excluded.mode_collecte, collectee_a = now()`,
      [date, value.massif.nom, value.level, sourceUrl, JSON.stringify(data), risque.modeCollecte],
    );
  }
  return values.length;
}

/** Collecte les niveaux officiels des massifs gardois, pour aujourd'hui et demain si publiés. */
export async function run(pool: pg.Pool): Promise<number | { nbLignes: number; statut: "partiel"; avertissement: string }> {
  const dates = [parisDate(0), parisDate(1)];
  let count = 0;
  let currentAvailable = false;
  const avertissements: string[] = [];

  for (const date of dates) {
    let risque: GardDailyRisk | null;
    try {
      risque = await fetchDailyRisk(date);
    } catch (error) {
      if (date === dates[0]) throw error;
      avertissements.push(`Publication du lendemain indisponible : ${(error as Error).message}`);
      continue;
    }
    if (risque === null) continue;
    if (date === dates[0]) currentAvailable = true;
    count += await saveRisk(pool, date, risque);
  }
  if (!currentAvailable) throw new Error("Risque incendie Gard : publication du jour indisponible");
  if (avertissements.length > 0) {
    return { nbLignes: count, statut: "partiel", avertissement: avertissements.join(" ; ") };
  }
  return count;
}
