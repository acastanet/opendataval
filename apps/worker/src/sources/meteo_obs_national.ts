import type pg from "pg";

const DEFAULT_HOURLY_PACKET_URL =
  "https://public-api.meteofrance.fr/public/DPPaquetObs/v1/paquet/stations/horaire";
const DEFAULT_MINIMUM_OBSERVATIONS = 500;

export interface NationalHourlyObservation {
  numPoste: string;
  heureUtc: string;
  t: number | null;
  humidite: number | null;
  ventDir: number | null;
  ventKmh: number | null;
  rafaleKmh: number | null;
  pluie1hMm: number | null;
  pressionHpa: number | null;
  neigeCm: number | null;
}

export interface ParsedHourlyPacket {
  observations: NationalHourlyObservation[];
  rejectedRows: number;
  duplicateRows: number;
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stationId(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,8}$/.test(raw)) return null;
  return raw.padStart(8, "0");
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function kelvinToCelsius(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed === null) return null;
  const celsius = parsed > 100 ? parsed - 273.15 : parsed;
  return celsius >= -90 && celsius <= 70
    ? Math.round(celsius * 10) / 10
    : null;
}

function metresPerSecondToKmh(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.round(parsed * 3.6 * 10) / 10;
}

function pascalToHectopascal(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed === null) return null;
  const hectopascal = parsed > 2_000 ? parsed / 100 : parsed;
  return Math.round(hectopascal * 10) / 10;
}

function metresToCentimetres(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.round(parsed * 100 * 10) / 10;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.round(parsed);
}

function properties(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const nested = record.properties;
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : record;
}

function packetRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as Record<string, unknown>;
  for (const candidate of [record.features, record.data, record.observations, record.items]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function first(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function mergeObservation(
  previous: NationalHourlyObservation,
  incoming: NationalHourlyObservation,
): NationalHourlyObservation {
  return {
    numPoste: previous.numPoste,
    heureUtc: previous.heureUtc,
    t: incoming.t ?? previous.t,
    humidite: incoming.humidite ?? previous.humidite,
    ventDir: incoming.ventDir ?? previous.ventDir,
    ventKmh: incoming.ventKmh ?? previous.ventKmh,
    rafaleKmh: incoming.rafaleKmh ?? previous.rafaleKmh,
    pluie1hMm: incoming.pluie1hMm ?? previous.pluie1hMm,
    pressionHpa: incoming.pressionHpa ?? previous.pressionHpa,
    neigeCm: incoming.neigeCm ?? previous.neigeCm,
  };
}

export function parseHourlyObservationPacket(payload: unknown): ParsedHourlyPacket {
  const observationsByKey = new Map<string, NationalHourlyObservation>();
  let rejectedRows = 0;
  let duplicateRows = 0;

  for (const rawRow of packetRows(payload)) {
    const row = properties(rawRow);
    if (row === null) {
      rejectedRows += 1;
      continue;
    }

    const numPoste = stationId(first(row, ["geo_id_insee", "id_station", "num_poste"]));
    const heureUtc = isoTimestamp(first(row, ["validity_time", "heure_utc", "date"]));
    if (numPoste === null || heureUtc === null) {
      rejectedRows += 1;
      continue;
    }

    const observation: NationalHourlyObservation = {
      numPoste,
      heureUtc,
      t: kelvinToCelsius(row.t),
      humidite: integerValue(first(row, ["u", "humidite"])),
      ventDir: integerValue(first(row, ["dd", "vent_dir"])),
      ventKmh: metresPerSecondToKmh(first(row, ["ff", "vent_moyen"])),
      rafaleKmh: metresPerSecondToKmh(first(row, ["raf10", "fxi10", "raf", "vent_rafales"])),
      pluie1hMm: numberValue(first(row, ["rr1", "rr_per", "pluie_1h"])),
      pressionHpa: pascalToHectopascal(first(row, ["pmer", "pres", "pression"])),
      neigeCm: metresToCentimetres(first(row, ["sss", "neige"])),
    };

    const key = `${numPoste}:${heureUtc}`;
    const previous = observationsByKey.get(key);
    if (previous) {
      duplicateRows += 1;
      observationsByKey.set(key, mergeObservation(previous, observation));
    } else {
      observationsByKey.set(key, observation);
    }
  }

  return {
    observations: [...observationsByKey.values()],
    rejectedRows,
    duplicateRows,
  };
}

export function latestPublishedHour(now = new Date()): Date {
  const result = new Date(now);
  const currentMinutes = result.getUTCMinutes();
  result.setUTCMinutes(0, 0, 0);
  if (currentMinutes < 15) result.setUTCHours(result.getUTCHours() - 1);
  return result;
}

export async function upsertNationalHourlyObservations(
  pool: pg.Pool,
  observations: readonly NationalHourlyObservation[],
): Promise<void> {
  if (observations.length === 0) return;

  await pool.query(
    `insert into series.meteo_horaire
       (num_poste, heure_utc, t, humidite, vent_dir, vent_kmh, rafale_kmh, pluie_1h_mm, pression_hpa, neige_cm)
     select np, h, t, hu, vd, vk, rk, p1, ph, nc
     from unnest(
       $1::text[], $2::timestamptz[], $3::numeric[], $4::smallint[], $5::smallint[],
       $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[]
     ) as rows(np, h, t, hu, vd, vk, rk, p1, ph, nc)
     on conflict (num_poste, heure_utc) do update set
       t = excluded.t,
       humidite = excluded.humidite,
       vent_dir = excluded.vent_dir,
       vent_kmh = excluded.vent_kmh,
       rafale_kmh = excluded.rafale_kmh,
       pluie_1h_mm = excluded.pluie_1h_mm,
       pression_hpa = excluded.pression_hpa,
       neige_cm = excluded.neige_cm`,
    [
      observations.map((observation) => observation.numPoste),
      observations.map((observation) => observation.heureUtc),
      observations.map((observation) => observation.t),
      observations.map((observation) => observation.humidite),
      observations.map((observation) => observation.ventDir),
      observations.map((observation) => observation.ventKmh),
      observations.map((observation) => observation.rafaleKmh),
      observations.map((observation) => observation.pluie1hMm),
      observations.map((observation) => observation.pressionHpa),
      observations.map((observation) => observation.neigeCm),
    ],
  );
}

export async function run(
  pool: pg.Pool,
  now = new Date(),
): Promise<number | { nbLignes: number; statut: "ok" | "partiel"; avertissement?: string }> {
  const token = process.env.METEOFRANCE_API_TOKEN;
  if (!token) throw new Error("meteo_obs_national : METEOFRANCE_API_TOKEN absent");

  const requestedAt = latestPublishedHour(now);
  const url = new URL(
    process.env.METEOFRANCE_HOURLY_PACKET_URL ?? DEFAULT_HOURLY_PACKET_URL,
  );
  url.searchParams.set("date", requestedAt.toISOString());
  url.searchParams.set("format", "geojson");

  const response = await fetch(url, {
    headers: {
      accept: "application/geo+json,application/json,*/*",
      Authorization: `Bearer ${token}`,
      apikey: token,
      "User-Agent": "opendata-vda-worker/1.0",
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`meteo_obs_national -> HTTP ${response.status}`);

  const parsed = parseHourlyObservationPacket(await response.json());
  if (parsed.observations.length === 0) {
    throw new Error(
      `meteo_obs_national : aucune observation valide pour ${requestedAt.toISOString()}`,
    );
  }

  await upsertNationalHourlyObservations(pool, parsed.observations);

  const configuredMinimum = Number(
    process.env.METEOFRANCE_MIN_HOURLY_OBSERVATIONS ?? DEFAULT_MINIMUM_OBSERVATIONS,
  );
  const minimumObservations = Number.isFinite(configuredMinimum) && configuredMinimum >= 0
    ? configuredMinimum
    : DEFAULT_MINIMUM_OBSERVATIONS;
  const warnings: string[] = [];
  if (parsed.rejectedRows === 1) warnings.push("1 ligne rejetée");
  else if (parsed.rejectedRows > 1) warnings.push(`${parsed.rejectedRows} lignes rejetées`);
  if (parsed.duplicateRows === 1) warnings.push("1 doublon fusionné");
  else if (parsed.duplicateRows > 1) warnings.push(`${parsed.duplicateRows} doublons fusionnés`);
  if (parsed.observations.length < minimumObservations) {
    warnings.push(
      `paquet incomplet probable : ${parsed.observations.length} observations, minimum ${minimumObservations}`,
    );
  }

  return warnings.length === 0
    ? parsed.observations.length
    : {
      nbLignes: parsed.observations.length,
      statut: "partiel",
      avertissement: warnings.join(" ; "),
    };
}
