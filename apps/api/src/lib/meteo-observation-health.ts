import type pg from "pg";

export const METEO_HEALTH_SCHEMA_VERSION = "1" as const;
export const METEO_HEALTH_FRESHNESS_MINUTES = 90;
export const METEO_HEALTH_MINIMUM_STATIONS = 1_000;

export const METEO_HEALTH_JOBS = [
  "meteo_stations",
  "meteo_obs_national",
  "meteo_obs",
  "meteo_radome",
  "meteo_infoclimat",
] as const;

export type MeteoHealthJobName = (typeof METEO_HEALTH_JOBS)[number];
export type MeteoHealthStatus = "ok" | "degraded";
export type MeteoHealthDegradedReason =
  | "catalogue_empty"
  | "catalogue_incomplete"
  | "observations_empty"
  | "observations_stale"
  | "critical_ingestion_error"
  | "critical_ingestion_never_succeeded";

export interface MeteoIngestionHealth {
  source: MeteoHealthJobName;
  critical: boolean;
  lastAttemptAt: string | null;
  lastAttemptCompletedAt: string | null;
  lastAttemptStatus: "ok" | "partiel" | "erreur" | "running" | "unknown" | null;
  lastAttemptRows: number | null;
  lastAttemptHadError: boolean;
  lastSuccessAt: string | null;
  lastSuccessRows: number | null;
}

export interface MeteoObservationHealth {
  schemaVersion: typeof METEO_HEALTH_SCHEMA_VERSION;
  status: MeteoHealthStatus;
  degradedReasons: MeteoHealthDegradedReason[];
  catalogue: {
    stationCount: number;
    minimumExpectedStations: number;
    updatedAt: string | null;
    status: "ready" | "incomplete" | "empty";
  };
  observations: {
    observedStationCount: number;
    freshStationCount: number;
    freshObservationCount: number;
    latestObservationAt: string | null;
    latestObservationAgeMinutes: number | null;
    maximumAgeMinutes: number;
    status: "fresh" | "stale" | "empty";
  };
  ingestion: MeteoIngestionHealth[];
  generatedAt: string;
}

interface CatalogueRow {
  station_count?: unknown;
  updated_at?: unknown;
}

interface ObservationRow {
  observed_station_count?: unknown;
  fresh_station_count?: unknown;
  fresh_observation_count?: unknown;
  latest_observation_at?: unknown;
}

interface IngestionRow {
  source?: unknown;
  attempt_started_at?: unknown;
  attempt_completed_at?: unknown;
  attempt_status?: unknown;
  attempt_rows?: unknown;
  attempt_has_error?: unknown;
  success_completed_at?: unknown;
  success_rows?: unknown;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown): string | null {
  const parsed = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function attemptStatus(value: unknown): MeteoIngestionHealth["lastAttemptStatus"] {
  if (value === null || value === undefined || value === "") return null;
  if (value === "ok" || value === "partiel" || value === "erreur") return value;
  if (value === "en_cours" || value === "running") return "running";
  return "unknown";
}

function criticalJob(source: MeteoHealthJobName): boolean {
  return source === "meteo_stations" || source === "meteo_obs_national";
}

function latestAgeMinutes(latestAt: string | null, now: Date): number | null {
  if (latestAt === null) return null;
  const age = (now.getTime() - Date.parse(latestAt)) / 60_000;
  return Math.round(Math.max(0, age) * 10) / 10;
}

export async function loadMeteoObservationHealth(
  pool: pg.Pool,
  now = new Date(),
): Promise<MeteoObservationHealth> {
  const freshnessBoundary = new Date(
    now.getTime() - METEO_HEALTH_FRESHNESS_MINUTES * 60_000,
  ).toISOString();

  const [catalogueResult, observationResult, ingestionResult] = await Promise.all([
    pool.query<CatalogueRow>(
      `select count(*)::int as station_count, max(maj) as updated_at
       from couches.objets
       where couche = 'station_meteo'`,
    ),
    pool.query<ObservationRow>(
      `select
         count(distinct num_poste)::int as observed_station_count,
         count(distinct num_poste) filter (where heure_utc >= $1::timestamptz)::int as fresh_station_count,
         count(*) filter (where heure_utc >= $1::timestamptz)::int as fresh_observation_count,
         max(heure_utc) as latest_observation_at
       from series.meteo_horaire
       where t is not null`,
      [freshnessBoundary],
    ),
    pool.query<IngestionRow>(
      `select
         requested.source,
         attempt.started_at as attempt_started_at,
         attempt.completed_at as attempt_completed_at,
         attempt.statut as attempt_status,
         attempt.nb_lignes as attempt_rows,
         attempt.has_error as attempt_has_error,
         success.completed_at as success_completed_at,
         success.nb_lignes as success_rows
       from unnest($1::text[]) with ordinality as requested(source, position)
       left join lateral (
         select
           coalesce(
             nullif(to_jsonb(log_row)->>'demarre_a', '')::timestamptz,
             nullif(to_jsonb(log_row)->>'commence_a', '')::timestamptz,
             nullif(to_jsonb(log_row)->>'created_at', '')::timestamptz,
             log_row.termine_a
           ) as started_at,
           log_row.termine_a as completed_at,
           log_row.statut,
           log_row.nb_lignes,
           log_row.erreur is not null and btrim(log_row.erreur) <> '' as has_error
         from meta.fetch_log as log_row
         where log_row.source = requested.source
         order by log_row.id desc
         limit 1
       ) as attempt on true
       left join lateral (
         select log_row.termine_a as completed_at, log_row.nb_lignes
         from meta.fetch_log as log_row
         where log_row.source = requested.source
           and log_row.statut in ('ok', 'partiel')
           and log_row.termine_a is not null
         order by log_row.id desc
         limit 1
       ) as success on true
       order by requested.position`,
      [[...METEO_HEALTH_JOBS]],
    ),
  ]);

  const catalogueRow = catalogueResult.rows[0] ?? {};
  const observationRow = observationResult.rows[0] ?? {};
  const stationCount = numberValue(catalogueRow.station_count);
  const observedStationCount = numberValue(observationRow.observed_station_count);
  const freshStationCount = numberValue(observationRow.fresh_station_count);
  const freshObservationCount = numberValue(observationRow.fresh_observation_count);
  const latestObservationAt = isoDate(observationRow.latest_observation_at);
  const latestObservationAgeMinutes = latestAgeMinutes(latestObservationAt, now);

  const ingestionBySource = new Map<MeteoHealthJobName, IngestionRow>();
  for (const row of ingestionResult.rows) {
    const source = String(row.source ?? "") as MeteoHealthJobName;
    if (METEO_HEALTH_JOBS.includes(source)) ingestionBySource.set(source, row);
  }
  const ingestion = METEO_HEALTH_JOBS.map((source): MeteoIngestionHealth => {
    const row = ingestionBySource.get(source) ?? {};
    return {
      source,
      critical: criticalJob(source),
      lastAttemptAt: isoDate(row.attempt_started_at),
      lastAttemptCompletedAt: isoDate(row.attempt_completed_at),
      lastAttemptStatus: attemptStatus(row.attempt_status),
      lastAttemptRows: nullableNumber(row.attempt_rows),
      lastAttemptHadError: booleanValue(row.attempt_has_error),
      lastSuccessAt: isoDate(row.success_completed_at),
      lastSuccessRows: nullableNumber(row.success_rows),
    };
  });

  const degradedReasons: MeteoHealthDegradedReason[] = [];
  if (stationCount === 0) degradedReasons.push("catalogue_empty");
  else if (stationCount < METEO_HEALTH_MINIMUM_STATIONS) {
    degradedReasons.push("catalogue_incomplete");
  }

  if (observedStationCount === 0 || latestObservationAt === null) {
    degradedReasons.push("observations_empty");
  } else if (
    freshStationCount === 0
    || latestObservationAgeMinutes === null
    || latestObservationAgeMinutes > METEO_HEALTH_FRESHNESS_MINUTES
  ) {
    degradedReasons.push("observations_stale");
  }

  const criticalIngestion = ingestion.filter((job) => job.critical);
  if (criticalIngestion.some((job) => job.lastAttemptStatus === "erreur" || job.lastAttemptHadError)) {
    degradedReasons.push("critical_ingestion_error");
  }
  if (criticalIngestion.some((job) => job.lastSuccessAt === null)) {
    degradedReasons.push("critical_ingestion_never_succeeded");
  }

  return {
    schemaVersion: METEO_HEALTH_SCHEMA_VERSION,
    status: degradedReasons.length === 0 ? "ok" : "degraded",
    degradedReasons,
    catalogue: {
      stationCount,
      minimumExpectedStations: METEO_HEALTH_MINIMUM_STATIONS,
      updatedAt: isoDate(catalogueRow.updated_at),
      status: stationCount === 0
        ? "empty"
        : stationCount < METEO_HEALTH_MINIMUM_STATIONS
          ? "incomplete"
          : "ready",
    },
    observations: {
      observedStationCount,
      freshStationCount,
      freshObservationCount,
      latestObservationAt,
      latestObservationAgeMinutes,
      maximumAgeMinutes: METEO_HEALTH_FRESHNESS_MINUTES,
      status: observedStationCount === 0 || latestObservationAt === null
        ? "empty"
        : freshStationCount === 0
          || latestObservationAgeMinutes === null
          || latestObservationAgeMinutes > METEO_HEALTH_FRESHNESS_MINUTES
          ? "stale"
          : "fresh",
    },
    ingestion,
    generatedAt: now.toISOString(),
  };
}
