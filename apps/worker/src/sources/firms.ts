import type pg from "pg";

const FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"] as const;
const DAYS_TO_FETCH = 1;
const MAX_TENTATIVES = 2;

interface FirmsBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface FirmsRecord {
  latitude: number;
  longitude: number;
  observedAt: string;
  satellite: string;
  instrument: string;
  confidence: string | null;
  frp: number | null;
  dayNight: "D" | "N" | null;
}

interface BboxRow {
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}

function parseObservedAt(date: string | undefined, time: string | undefined): string | null {
  if (date === undefined || time === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const paddedTime = time.padStart(4, "0");
  if (!/^\d{4}$/.test(paddedTime)) return null;
  const iso = `${date}T${paddedTime.slice(0, 2)}:${paddedTime.slice(2, 4)}:00Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function parseCsv(csv: string): FirmsRecord[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift();
  if (header === undefined) return [];

  const columns = splitCsvLine(header).map((column) => column.trim());
  const index = new Map(columns.map((column, position) => [column, position]));
  const requiredColumns = ["latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument"];
  if (requiredColumns.some((column) => !index.has(column))) {
    throw new Error("FIRMS : colonnes CSV attendues absentes");
  }

  const get = (values: string[], column: string): string | undefined => {
    const position = index.get(column);
    return position === undefined ? undefined : values[position];
  };

  return lines.flatMap((line) => {
    if (line.trim() === "") return [];
    const values = splitCsvLine(line);
    const latitude = parseNumber(get(values, "latitude"));
    const longitude = parseNumber(get(values, "longitude"));
    const observedAt = parseObservedAt(get(values, "acq_date"), get(values, "acq_time"));
    const satellite = get(values, "satellite")?.trim();
    const instrument = get(values, "instrument")?.trim();
    const dayNight = get(values, "daynight")?.trim();

    if (
      latitude === null || longitude === null || observedAt === null || satellite === undefined || satellite === "" ||
      instrument === undefined || instrument === ""
    ) {
      return [];
    }

    return [{
      latitude,
      longitude,
      observedAt,
      satellite,
      instrument,
      confidence: get(values, "confidence")?.trim() || null,
      frp: parseNumber(get(values, "frp")),
      dayNight: dayNight === "D" || dayNight === "N" ? dayNight : null,
    }];
  });
}

async function getDepartementBoundingBox(pool: pg.Pool): Promise<FirmsBoundingBox | null> {
  const { rows } = await pool.query<BboxRow>(
    `select ST_XMin(geom) as west, ST_YMin(geom) as south,
            ST_XMax(geom) as east, ST_YMax(geom) as north
       from incendies.zones where slug = 'departement_30'`,
  );
  const bbox = rows[0];
  if (!bbox || bbox.west === null || bbox.south === null || bbox.east === null || bbox.north === null) return null;
  return { west: bbox.west, south: bbox.south, east: bbox.east, north: bbox.north };
}

async function fetchSource(mapKey: string, source: string, bbox: FirmsBoundingBox): Promise<FirmsRecord[]> {
  const coordinates = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const url = `${FIRMS_BASE_URL}/${encodeURIComponent(mapKey)}/${source}/${coordinates}/${DAYS_TO_FETCH}`;
  let derniereErreur: Error | null = null;
  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenDataVdA/1.0 (+https://opendata.valdaigoual.fr)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`FIRMS ${source} -> HTTP ${response.status}`);
      return parseCsv(await response.text());
    } catch (error) {
      derniereErreur = error as Error;
      if (tentative < MAX_TENTATIVES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * tentative));
      }
    }
  }
  throw derniereErreur ?? new Error(`FIRMS ${source} indisponible`);
}

function externalId(detection: FirmsRecord): string {
  return [
    "firms",
    detection.satellite,
    detection.observedAt,
    detection.latitude.toFixed(5),
    detection.longitude.toFixed(5),
  ].join(":");
}

async function upsertDetection(pool: pg.Pool, detection: FirmsRecord): Promise<boolean> {
  const { rowCount } = await pool.query(
    `with coeur as (
       select geom from incendies.zones where slug = 'coeur'
     ), veille as (
       select geom from incendies.zones where slug = 'veille_15km'
     ), departement as (
       select geom from incendies.zones where slug = 'departement_30'
     ), point as (
       select ST_SetSRID(ST_MakePoint($2, $3), 4326) as geom
     )
     insert into incendies.detections_firms
       (external_id, observee_a, satellite, instrument, confiance, frp, jour_nuit, position, distance_coeur_m, geom)
     select $1, $4::timestamptz, $5, $6, $7, $8, $9,
       case
         when ST_Covers(coeur.geom, point.geom) then 'coeur'
         when ST_DWithin(coeur.geom::geography, point.geom::geography, 5000) then 'proche'
         when ST_Covers(veille.geom, point.geom) then 'veille'
         else 'departement'
       end,
       ST_Distance(coeur.geom::geography, point.geom::geography),
       point.geom
     from coeur cross join veille cross join departement cross join point
     where ST_Covers(departement.geom, point.geom)
     on conflict (external_id) do update set
       confiance = excluded.confiance,
       frp = excluded.frp,
       jour_nuit = excluded.jour_nuit,
       collectee_a = now()`,
    [
      externalId(detection),
      detection.longitude,
      detection.latitude,
      detection.observedAt,
      detection.satellite,
      detection.instrument,
      detection.confidence,
      detection.frp,
      detection.dayNight,
    ],
  );
  return rowCount === 1;
}

/** Collecte les anomalies thermiques VIIRS sur tout le département du Gard. */
export async function run(pool: pg.Pool): Promise<number | { nbLignes: number; statut: "partiel"; avertissement: string }> {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  if (!mapKey) throw new Error("FIRMS : NASA_FIRMS_MAP_KEY absente");

  const bbox = await getDepartementBoundingBox(pool);
  if (!bbox) {
    console.warn("[firms] ignoré — zone département non initialisée");
    return 0;
  }

  const resultats = await Promise.allSettled(SOURCES.map(async (source) => ({
    source,
    records: await fetchSource(mapKey, source, bbox),
  })));
  const succes = resultats.filter((resultat): resultat is PromiseFulfilledResult<{ source: typeof SOURCES[number]; records: FirmsRecord[] }> => resultat.status === "fulfilled");
  const echecs = resultats.flatMap((resultat, index) => resultat.status === "rejected" ? [SOURCES[index]] : []);
  if (succes.length === 0) throw new Error("FIRMS : les trois sources VIIRS sont indisponibles");
  const records = succes.flatMap((resultat) => resultat.value.records);
  let count = 0;
  for (const detection of records) {
    if (await upsertDetection(pool, detection)) count += 1;
  }
  if (echecs.length > 0) {
    return {
      nbLignes: count,
      statut: "partiel",
      avertissement: `${echecs.length} source(s) VIIRS indisponible(s) sur ${SOURCES.length} : ${echecs.join(", ")}`,
    };
  }
  return count;
}
