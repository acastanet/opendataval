import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import {
  POINTS_METEO_PRECONFIGURES,
  resoudreLocalisationMeteo,
  type CoordonneesMeteo,
} from "@opendata-vda/shared/localisations-meteo";
import {
  createGeographyResolver,
  unavailableGeography,
  type ResolvedGeography,
} from "../lib/geography.js";

const ALERT_LEVELS = ["green", "yellow", "orange", "red"] as const;
type AlertLevel = (typeof ALERT_LEVELS)[number];

interface EssentialWeather {
  location: {
    id: string | null;
    label: string;
    latitude: number;
    longitude: number;
    municipality: ResolvedGeography["municipality"];
    department: ResolvedGeography["department"];
    altitudeM: number | null;
    accuracyM: number | null;
    source: "preset" | "gps";
  };
  current: {
    temperatureC: number;
    apparentTemperatureC: number;
    weatherLabel: string;
    observedAt: string;
    nature: "observation" | "model";
    sourceLabel: string;
    stale: boolean;
  };
  today: {
    minimumC: number;
    maximumC: number;
  };
  nextChange: {
    type: "rain" | "wind" | "temperature" | "stable";
    startsAt: string | null;
    summary: string;
    probabilityPercent: number | null;
  };
  nextHours: {
    at: string;
    temperatureC: number;
    rainProbabilityPercent: number;
    windGustKmh: number;
  }[];
  alert: {
    level: AlertLevel;
    title: string;
    phenomena: string[];
    validUntil: string;
    sourceUrl: string;
    departmentCode: string | null;
    indisponible: boolean;
  };
  unavailableSources: string[];
  generatedAt: string;
}

interface LocationSummary {
  id: string;
  label: string;
  shortLabel: string;
  latitude: number;
  longitude: number;
}

interface VigilanceResult {
  niveau: AlertLevel;
  phenomenes: string[];
  miseAJour: Date | null;
  indisponible: boolean;
}

interface ObservationResult {
  temperatureC: number | null;
  observedAt: string | null;
  unavailable: boolean;
}

export interface MeteoV1Dependencies {
  resolveGeography?: (latitude: number, longitude: number) => Promise<ResolvedGeography>;
  fetchWeatherJson?: (url: string) => Promise<unknown>;
  fetchVigilance?: (departmentCode: string) => Promise<VigilanceResult>;
}

const DEFAULT_GEOGRAPHY_RESOLVER = createGeographyResolver();

function validerCoordonnees(latStr?: string, lonStr?: string): CoordonneesMeteo | null {
  if (!latStr || !lonStr) return null;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function validerPrecision(value?: string): number | undefined | null {
  if (value === undefined) return undefined;
  const accuracyM = Number(value);
  return Number.isFinite(accuracyM) && accuracyM >= 0 ? accuracyM : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "opendata-vda-api/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Source météo HTTP ${response.status}`);
  return response.json();
}

function getNumber(object: unknown, key: string): number | null {
  if (typeof object !== "object" || object === null) return null;
  const value = (object as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNumberArray(object: unknown, key: string): number[] {
  if (typeof object !== "object" || object === null) return [];
  const value = (object as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function meteoFranceUrl(latitude: number, longitude: number): string {
  const url = new URL("https://api.open-meteo.com/v1/meteofrance");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "Europe/Paris");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,wind_gusts_10m,weather_code",
  );
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code");
  return url.toString();
}

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Ciel dégagé",
  1: "Plutôt dégagé",
  2: "Nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine fine",
  53: "Bruine modérée",
  55: "Bruine dense",
  56: "Bruine verglaçante fine",
  57: "Bruine verglaçante dense",
  61: "Pluie faible",
  63: "Pluie modérée",
  65: "Pluie forte",
  66: "Pluie verglaçante faible",
  67: "Pluie verglaçante forte",
  71: "Neige faible",
  73: "Neige modérée",
  75: "Neige forte",
  77: "Grains de neige",
  80: "Averses de pluie faibles",
  81: "Averses de pluie modérées",
  82: "Averses de pluie violentes",
  85: "Averses de neige faibles",
  86: "Averses de neige fortes",
  95: "Orage",
  96: "Orage avec grêle faible",
  99: "Orage avec grêle forte",
};

function weatherCodeLabel(code: unknown): string {
  if (typeof code !== "number" || !Number.isInteger(code)) return "Données indisponibles";
  return WMO_DESCRIPTIONS[code] ?? "Phénomène non référencé";
}

const COULEUR_VIGILANCE: Record<number, AlertLevel> = {
  1: "green",
  2: "yellow",
  3: "orange",
  4: "red",
};

const PHENOMENE_NOMS: Record<string, string> = {
  "1": "Vent violent",
  "2": "Pluie-inondation",
  "3": "Orages",
  "4": "Crues",
  "5": "Neige-verglas",
  "6": "Canicule",
  "7": "Grand froid",
  "8": "Avalanches",
  "9": "Vagues-submersion",
};

async function recupererVigilance(codeDep: string): Promise<VigilanceResult> {
  const token = process.env.METEOFRANCE_API_TOKEN_VIGILANCE ?? process.env.METEOFRANCE_API_TOKEN;
  if (!token) {
    return { niveau: "green", phenomenes: [], miseAJour: null, indisponible: true };
  }
  try {
    const response = await fetch(
      "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours",
      {
        headers: { apikey: token, "User-Agent": "opendata-vda-api/1.0" },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) throw new Error(`DPVigilance HTTP ${response.status}`);
    return parserVigilancePourDept(await response.json(), codeDep);
  } catch {
    return { niveau: "green", phenomenes: [], miseAJour: null, indisponible: true };
  }
}

function parserVigilancePourDept(data: unknown, codeDep: string): VigilanceResult {
  if (typeof data !== "object" || data === null) {
    return { niveau: "green", phenomenes: [], miseAJour: null, indisponible: true };
  }
  const product =
    (data as Record<string, unknown>).product ??
    (data as Record<string, unknown>).data ??
    data;
  if (typeof product !== "object" || product === null) {
    return { niveau: "green", phenomenes: [], miseAJour: null, indisponible: true };
  }

  const payload = product as Record<string, unknown>;
  const updateTime = String(payload.update_time ?? payload.timestamp ?? "");
  const miseAJour = updateTime ? new Date(updateTime) : null;
  let meilleurNiveau = 1;
  let departmentFound = false;
  const phenomenes = new Set<string>();

  function readDomainIds(domainIds: unknown[]): void {
    for (const item of domainIds) {
      if (typeof item !== "object" || item === null) continue;
      const entry = item as Record<string, unknown>;
      if (String(entry.domain_id ?? entry.domain ?? "") !== codeDep) continue;
      departmentFound = true;
      const color = Number(entry.max_color_id ?? entry.max_color ?? entry.color_id ?? 1);
      if (Number.isFinite(color) && color > meilleurNiveau) meilleurNiveau = color;

      const rawPhenomena = entry.phenomenon_ids ?? entry.phenomena;
      if (!Array.isArray(rawPhenomena)) continue;
      for (const phenomenon of rawPhenomena) {
        if (typeof phenomenon !== "object" || phenomenon === null) continue;
        const properties = phenomenon as Record<string, unknown>;
        const id = String(properties.phenomenon_id ?? properties.id ?? properties.code ?? "");
        if (PHENOMENE_NOMS[id]) phenomenes.add(PHENOMENE_NOMS[id]);
      }
    }
  }

  const periods = Array.isArray(payload.periods) ? payload.periods : [];
  for (const period of periods) {
    if (typeof period !== "object" || period === null) continue;
    const timelaps = (period as Record<string, unknown>).timelaps;
    if (typeof timelaps !== "object" || timelaps === null) continue;
    const domainIds = (timelaps as Record<string, unknown>).domain_ids;
    if (Array.isArray(domainIds)) readDomainIds(domainIds);
  }

  if (!departmentFound && typeof payload.timelaps === "object" && payload.timelaps !== null) {
    const domainIds = (payload.timelaps as Record<string, unknown>).domain_ids;
    if (Array.isArray(domainIds)) readDomainIds(domainIds);
  }

  return {
    niveau: COULEUR_VIGILANCE[meilleurNiveau] ?? "green",
    phenomenes: [...phenomenes],
    miseAJour,
    indisponible: !departmentFound,
  };
}

const NIVEAUX_FR: Record<AlertLevel, string> = {
  green: "verte",
  yellow: "jaune",
  orange: "orange",
  red: "rouge",
};

function determinerNextChange(
  hourlyData: unknown,
  now: Date,
): EssentialWeather["nextChange"] {
  const hourly = typeof hourlyData === "object" && hourlyData !== null ? hourlyData : {};
  const hourlyTimes = getNumberArray(hourly, "time");
  const weatherCodes = getNumberArray(hourly, "weather_code");
  const precipitationProbability = getNumberArray(hourly, "precipitation_probability");
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const firstFutureIndex = hourlyTimes.findIndex((timestamp) => timestamp >= nowSeconds);
  const startIndex = firstFutureIndex >= 0 ? firstFutureIndex : 0;

  for (
    let index = startIndex;
    index < Math.min(precipitationProbability.length, startIndex + 24);
    index += 1
  ) {
    const probability = precipitationProbability[index];
    if (probability !== undefined && probability >= 30) {
      const description = WMO_DESCRIPTIONS[weatherCodes[index] ?? 0] ?? "Précipitations";
      return {
        type: "rain",
        startsAt: hourlyTimes[index]
          ? new Date((hourlyTimes[index] as number) * 1_000).toISOString()
          : addHours(now.toISOString(), index - startIndex),
        summary: `${description} probables.`,
        probabilityPercent: Math.min(100, Math.round(probability)),
      };
    }
  }

  return {
    type: "stable",
    startsAt: null,
    summary: "Pas de changement significatif dans les prochaines heures.",
    probabilityPercent: null,
  };
}

async function lireObservationAigoual(pool: pg.Pool): Promise<ObservationResult> {
  try {
    const { rows } = await pool.query(
      `select distinct on (num_poste) num_poste, t, heure_utc
       from series.meteo_horaire
       where num_poste = $1
       order by num_poste, heure_utc desc limit 1`,
      ["07630"],
    );
    const row = rows[0] as { t?: number; heure_utc?: string } | undefined;
    return typeof row?.t === "number" && typeof row.heure_utc === "string"
      ? { temperatureC: row.t, observedAt: row.heure_utc, unavailable: false }
      : { temperatureC: null, observedAt: null, unavailable: true };
  } catch {
    return { temperatureC: null, observedAt: null, unavailable: true };
  }
}

async function resoudreGeographieSure(
  resolver: (latitude: number, longitude: number) => Promise<ResolvedGeography>,
  latitude: number,
  longitude: number,
): Promise<ResolvedGeography> {
  try {
    return await resolver(latitude, longitude);
  } catch {
    return unavailableGeography(latitude, longitude);
  }
}

async function normaliserEssential(
  lat: number,
  lon: number,
  accuracyM: number | undefined,
  pool: pg.Pool,
  dependencies: Required<MeteoV1Dependencies>,
): Promise<EssentialWeather> {
  const now = new Date();
  const generatedAt = now.toISOString();
  const localisation = resoudreLocalisationMeteo(lat, lon);
  const { lat: normalizedLat, lon: normalizedLon } = localisation.normalisee;
  const unavailableSources: string[] = [];

  const geographyPromise = resoudreGeographieSure(
    dependencies.resolveGeography,
    normalizedLat,
    normalizedLon,
  );
  const weatherPromise = dependencies.fetchWeatherJson(
    meteoFranceUrl(normalizedLat, normalizedLon),
  ).catch(() => null);
  const observationPromise = localisation.pointPreconfigure?.slug === "val-aigoual"
    ? lireObservationAigoual(pool)
    : Promise.resolve<ObservationResult>({
      temperatureC: null,
      observedAt: null,
      unavailable: false,
    });

  const [geography, weatherData, observation] = await Promise.all([
    geographyPromise,
    weatherPromise,
    observationPromise,
  ]);
  unavailableSources.push(...geography.unavailableSources);
  if (weatherData === null) unavailableSources.push("Modèles Météo-France (AROME/ARPEGE)");
  if (observation.unavailable) unavailableSources.push("Observations Météo-France");

  const location: EssentialWeather["location"] = {
    id: localisation.pointPreconfigure?.slug ?? null,
    label: localisation.pointPreconfigure?.label ?? geography.label,
    latitude: lat,
    longitude: lon,
    municipality: geography.municipality,
    department: geography.department,
    altitudeM: geography.altitudeM,
    accuracyM: accuracyM ?? null,
    source: localisation.type === "preconfiguree" ? "preset" : "gps",
  };

  const currentData = weatherData
    ? (weatherData as Record<string, unknown>).current
    : null;
  const hourlyData = weatherData
    ? (weatherData as Record<string, unknown>).hourly
    : null;
  const dailyData = weatherData
    ? (weatherData as Record<string, unknown>).daily
    : null;

  const hourlyTemperatures = getNumberArray(hourlyData, "temperature_2m");
  const hourlyTimes = getNumberArray(hourlyData, "time");
  const hourlyRain = getNumberArray(hourlyData, "precipitation_probability");
  const hourlyWind = getNumberArray(hourlyData, "wind_gusts_10m");
  const weatherCodes = getNumberArray(hourlyData, "weather_code");
  const modelTemperature = getNumber(currentData, "temperature_2m") ?? hourlyTemperatures[0] ?? null;

  if (observation.temperatureC === null && modelTemperature === null) {
    throw new Error("Aucune température exploitable");
  }

  const observationMinutes = observation.observedAt
    ? (now.getTime() - new Date(observation.observedAt).getTime()) / 60_000
    : Number.POSITIVE_INFINITY;
  const usesObservation = observation.temperatureC !== null && observationMinutes < 60;
  const currentTemperature = usesObservation
    ? observation.temperatureC as number
    : modelTemperature as number;
  const apparentTemperature = getNumber(currentData, "apparent_temperature") ?? currentTemperature;
  const currentWeatherCode = getNumber(currentData, "weather_code") ?? weatherCodes[0] ?? null;
  const currentTimestamp = getNumber(currentData, "time");
  const modelObservedAt = currentTimestamp === null
    ? generatedAt
    : new Date(currentTimestamp * 1_000).toISOString();

  const current: EssentialWeather["current"] = {
    temperatureC: Math.round(currentTemperature * 10) / 10,
    apparentTemperatureC: Math.round(apparentTemperature * 10) / 10,
    weatherLabel: weatherCodeLabel(currentWeatherCode),
    observedAt: usesObservation ? observation.observedAt as string : modelObservedAt,
    nature: usesObservation ? "observation" : "model",
    sourceLabel: usesObservation
      ? "Station Météo-France Mont Aigoual"
      : "AROME HD via Open-Meteo",
    stale: usesObservation && observationMinutes > 120,
  };

  const dailyMaximums = getNumberArray(dailyData, "temperature_2m_max");
  const dailyMinimums = getNumberArray(dailyData, "temperature_2m_min");
  const today: EssentialWeather["today"] = {
    minimumC: Math.round(Math.min(currentTemperature, dailyMinimums[0] ?? currentTemperature) * 10) / 10,
    maximumC: Math.round(Math.max(currentTemperature, dailyMaximums[0] ?? currentTemperature) * 10) / 10,
  };

  const nextHours: EssentialWeather["nextHours"] = [];
  const firstFutureIndex = hourlyTimes.findIndex(
    (timestamp) => timestamp >= Math.floor(now.getTime() / 1_000),
  );
  const startIndex = firstFutureIndex >= 0 ? firstFutureIndex : 0;
  for (
    let index = startIndex;
    index < Math.min(hourlyTemperatures.length, startIndex + 6);
    index += 1
  ) {
    nextHours.push({
      at: hourlyTimes[index]
        ? new Date((hourlyTimes[index] as number) * 1_000).toISOString()
        : addHours(generatedAt, index - startIndex),
      temperatureC: Math.round((hourlyTemperatures[index] ?? currentTemperature) * 10) / 10,
      rainProbabilityPercent: Math.min(100, Math.max(0, Math.round(hourlyRain[index] ?? 0))),
      windGustKmh: Math.round((hourlyWind[index] ?? 0) * 10) / 10,
    });
  }
  if (nextHours.length === 0) {
    nextHours.push({
      at: addHours(generatedAt, 1),
      temperatureC: Math.round(currentTemperature * 10) / 10,
      rainProbabilityPercent: 0,
      windGustKmh: 0,
    });
  }

  const departmentCode = geography.department?.code ?? null;
  const vigilance = departmentCode
    ? await dependencies.fetchVigilance(departmentCode)
    : { niveau: "green" as const, phenomenes: [], miseAJour: null, indisponible: true };
  if (vigilance.indisponible) unavailableSources.push("Vigilance Météo-France");

  const alert: EssentialWeather["alert"] = {
    level: vigilance.niveau,
    title: vigilance.indisponible
      ? "Vigilance Météo-France indisponible"
      : vigilance.niveau === "green"
        ? "Aucune vigilance particulière"
        : `Vigilance ${NIVEAUX_FR[vigilance.niveau]}`,
    phenomena: vigilance.phenomenes,
    validUntil: addHours(generatedAt, 24),
    sourceUrl: "https://vigilance.meteofrance.fr/fr",
    departmentCode,
    indisponible: vigilance.indisponible,
  };

  return {
    location,
    current,
    today,
    nextChange: determinerNextChange(hourlyData, now),
    nextHours,
    alert,
    unavailableSources: [...new Set(unavailableSources)],
    generatedAt,
  };
}

export function registerMeteoV1Routes(
  app: FastifyInstance,
  pool: pg.Pool,
  overrides: MeteoV1Dependencies = {},
): void {
  const dependencies: Required<MeteoV1Dependencies> = {
    resolveGeography: overrides.resolveGeography
      ?? ((latitude, longitude) => DEFAULT_GEOGRAPHY_RESOLVER.resolve(latitude, longitude)),
    fetchWeatherJson: overrides.fetchWeatherJson ?? fetchJson,
    fetchVigilance: overrides.fetchVigilance ?? recupererVigilance,
  };

  app.get("/api/v1/meteo/locations", async (_request: FastifyRequest, reply: FastifyReply) => {
    const locations: LocationSummary[] = POINTS_METEO_PRECONFIGURES.map((point) => ({
      id: point.slug,
      label: point.label,
      shortLabel: point.nom,
      latitude: point.lat,
      longitude: point.lon,
    }));
    reply.header("cache-control", "public, max-age=3600");
    return { locations };
  });

  app.get<{ Querystring: { lat?: string; lon?: string } }>(
    "/api/v1/meteo/location",
    async (request, reply) => {
      const coordinates = validerCoordonnees(request.query.lat, request.query.lon);
      if (!coordinates) {
        reply.code(400);
        return { error: "Coordonnées lat/lon invalides. Latitude -90..90, longitude -180..180." };
      }

      const resolved = await resoudreGeographieSure(
        dependencies.resolveGeography,
        coordinates.lat,
        coordinates.lon,
      );
      reply.header("cache-control", "private, max-age=3600");
      return resolved;
    },
  );

  app.get<{ Querystring: { lat?: string; lon?: string; accuracyM?: string } }>(
    "/api/v1/meteo/essential",
    async (request, reply) => {
      const coordinates = validerCoordonnees(request.query.lat, request.query.lon);
      const accuracyM = validerPrecision(request.query.accuracyM);
      if (!coordinates || accuracyM === null) {
        reply.code(400);
        return {
          error: "Coordonnées ou précision invalides. Latitude -90..90, longitude -180..180.",
        };
      }

      try {
        const essential = await normaliserEssential(
          coordinates.lat,
          coordinates.lon,
          accuracyM,
          pool,
          dependencies,
        );
        reply.header("cache-control", "private, max-age=300");
        return essential;
      } catch (error) {
        request.log.error({ err: error }, "Erreur météo essentielle");
        reply.code(503);
        return {
          error: "Aucune donnée météo exploitable.",
          unavailableSources: ["Toutes les sources météo"],
          generatedAt: new Date().toISOString(),
        };
      }
    },
  );
}
