import type pg from "pg";

const GARD_BASE_URL = "https://www.risque-prevention-incendie.fr/static/30/import_data";

const MASSIFS = [
  { id: "301", nom: "CAUSSE AIGOUAL" },
  { id: "302", nom: "SUD CEVENNES" },
  { id: "303", nom: "NORD CEVENNES" },
] as const;

interface GardFile {
  massifs?: Record<string, [number, number]>;
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

async function fetchDailyRisk(date: string): Promise<GardFile | null> {
  const compactDate = date.replaceAll("-", "");
  const response = await fetch(`${GARD_BASE_URL}/${compactDate}.json`, {
    headers: { "User-Agent": "OpenDataVdA/1.0 (+https://opendata.valdaigoual.fr)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Risque incendie Gard ${date} -> HTTP ${response.status}`);
  return (await response.json()) as GardFile;
}

async function saveRisk(pool: pg.Pool, date: string, data: GardFile): Promise<number> {
  const values = MASSIFS.flatMap((massif) => {
    const entry = data.massifs?.[massif.id];
    return entry === undefined ? [] : [{ massif, level: niveau(entry[0]) }];
  });
  if (values.length === 0) throw new Error(`Risque incendie Gard ${date} : aucun massif attendu`);

  const sourceUrl = `${GARD_BASE_URL}/${date.replaceAll("-", "")}.json`;
  for (const value of values) {
    await pool.query(
      `insert into incendies.risques_officiels
         (date_validite, departement, zone_officielle, niveau, restrictions, source_url)
       values ($1::date, 'Gard', $2, $3, null, $4)
       on conflict (date_validite, departement, zone_officielle) do update set
         niveau = excluded.niveau, restrictions = excluded.restrictions,
         source_url = excluded.source_url, collectee_a = now()`,
      [date, value.massif.nom, value.level, sourceUrl],
    );
  }
  return values.length;
}

/** Collecte les niveaux officiels des massifs gardois, pour aujourd'hui et demain si publiés. */
export async function run(pool: pg.Pool): Promise<number> {
  const dates = [parisDate(0), parisDate(1)];
  let count = 0;
  let currentAvailable = false;

  for (const date of dates) {
    const data = await fetchDailyRisk(date);
    if (data === null) continue;
    if (date === dates[0]) currentAvailable = true;
    count += await saveRisk(pool, date, data);
  }
  if (!currentAvailable) throw new Error("Risque incendie Gard : publication du jour indisponible");
  return count;
}
