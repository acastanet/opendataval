import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import {
  POINTS_METEO_PRECONFIGURES,
  resoudreLocalisationMeteo,
  type CoordonneesMeteo,
} from "@opendata-vda/shared";

/* ────────── types internes ────────── */

const ALERT_LEVELS = ["green", "yellow", "orange", "red"] as const;
type AlertLevel = (typeof ALERT_LEVELS)[number];

interface EssentialWeather {
  location: {
    id: string | null;
    label: string;
    latitude: number;
    longitude: number;
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

type ChangeType = "rain" | "wind" | "temperature" | "stable";

/* ────────── helpers ────────── */

function validerCoordonnees(latStr?: string, lonStr?: string): CoordonneesMeteo | null {
  if (!latStr || !lonStr) return null;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "opendata-vda-api/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function getNumber(obj: unknown, key: string): number | null {
  if (typeof obj !== "object" || obj === null) return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getNumberArray(obj: unknown, key: string): number[] {
  if (typeof obj !== "object" || obj === null) return [];
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : [];
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

function isoNow(): string {
  return new Date().toISOString();
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

/** Construit l'Open-Meteo URL pour un point donné */
function meteoFranceUrl(lat: number, lon: number): string {
  const url = new URL("https://api.open-meteo.com/v1/meteofrance");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", "Europe/Paris");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,wind_gusts_10m,weather_code",
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,weather_code",
  );
  return url.toString();
}

/* ────────── vigilance ────────── */

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

/** Résultat brut de la vigilance : soit réussite avec niveau réel, soit indisponible. */
interface VigilanceResult {
  niveau: AlertLevel;
  phenomenes: string[];
  miseAJour: Date | null;
  /** true si la source Météo-France était injoignable (level = repli green) */
  indisponible: boolean;
}

/** Interroge la carte de vigilance Météo-France. Retourne l'état pour le département demandé. */
async function recupererVigilance(codeDep: string): Promise<VigilanceResult> {
  const token = process.env.METEOFRANCE_API_TOKEN_VIGILANCE ?? process.env.METEOFRANCE_API_TOKEN;
  if (!token) {
    return { niveau: "green", phenomenes: [], miseAJour: null, indisponible: true };
  }
  try {
    const url = "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";
    const res = await fetch(url, {
      headers: { apikey: token, "User-Agent": "opendata-vda-api/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`DPVigilance HTTP ${res.status}`);
    const data: unknown = await res.json();
    return parserVigilancePourDept(data, codeDep);
  } catch (err) {
    return { niveau: "green", phenomenes: [], miseAJour: null, indisponible: true };
  }
}

/** Parse la réponse brute de la carte de vigilance pour un département donné.
 * Format V6 : product.periods[].timelaps.domain_ids[]
 *   domain_id: string (code département, e.g. "30")
 *   max_color_id: string ("1".."4")
 *   phenomenon_ids: [{phenomenon_id: number, color_id: number}]
 */
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
  const p = product as Record<string, unknown>;

  const updateTime = String(p.update_time ?? p.timestamp ?? "");
  const miseAJour = updateTime ? new Date(updateTime) : null;

  // Chercher dans les periodes (format V6)
  const periods: unknown[] = Array.isArray(p.periods) ? p.periods : [];

  let meilleurNiveau: number = 1; // 1 = green (min)
  const phenomenesTrouves = new Set<string>();

  for (const period of periods) {
    if (typeof period !== "object" || period === null) continue;
    const timelaps = (period as Record<string, unknown>).timelaps;
    if (typeof timelaps !== "object" || timelaps === null) continue;
    const domainIds: unknown[] = Array.isArray((timelaps as Record<string, unknown>).domain_ids)
      ? ((timelaps as Record<string, unknown>).domain_ids as unknown[])
      : [];

    for (const di of domainIds) {
      if (typeof di !== "object" || di === null) continue;
      const entry = di as Record<string, unknown>;
      const did = String(entry.domain_id ?? entry.domain ?? "");
      if (did !== codeDep) continue;

      const maxColor = Number(entry.max_color_id ?? entry.max_color ?? entry.color_id ?? 1);
      if (maxColor > meilleurNiveau) meilleurNiveau = maxColor;

      // Phénomènes
      const phenInput2 = entry.phenomenon_ids ?? entry.phenomena ?? null;
      const phenIds: unknown[] = Array.isArray(phenInput2) ? phenInput2 : [];
      for (const ph of phenIds) {
        if (typeof ph !== "object" || ph === null) continue;
        const pid = String(
          (ph as Record<string, unknown>).phenomenon_id ??
          (ph as Record<string, unknown>).id ??
          (ph as Record<string, unknown>).code ??
          "",
        );
        if (PHENOMENE_NOMS[pid]) phenomenesTrouves.add(PHENOMENE_NOMS[pid]);
      }
    }
  }

  // Fallback : chercher dans product.timelaps.domain_ids (structure alternative)
  if (meilleurNiveau === 1) {
    const globalTimelaps = p.timelaps;
    if (typeof globalTimelaps === "object" && globalTimelaps !== null) {
      const globalIds: unknown[] = Array.isArray((globalTimelaps as Record<string, unknown>).domain_ids)
        ? ((globalTimelaps as Record<string, unknown>).domain_ids as unknown[])
        : [];
      for (const di of globalIds) {
        if (typeof di !== "object" || di === null) continue;
        const entry = di as Record<string, unknown>;
        const did = String(entry.domain_id ?? entry.domain ?? "");
        if (did !== codeDep) continue;
        const maxColor = Number(entry.max_color_id ?? entry.max_color ?? 1);
        if (maxColor > meilleurNiveau) meilleurNiveau = maxColor;
      }
    }
  }

  const niveau = COULEUR_VIGILANCE[meilleurNiveau] ?? "green";
  const trouve = meilleurNiveau > 1 || miseAJour !== null;

  return {
    niveau,
    phenomenes: [...phenomenesTrouves],
    miseAJour,
    indisponible: !trouve,
  };
}

/* ────────── normalisation essentielle ────────── */

function determinerNextChange(
  hourlyData: unknown,
): EssentialWeather["nextChange"] {
  const hourly = (hourlyData as Record<string, unknown>) ?? {};
  const weatherCodes = getNumberArray(hourly, "weather_code");
  const precipitationProb = getNumberArray(hourly, "precipitation_probability");
  const now = new Date();
  const nowHour = now.getHours();

  for (let i = 1; i < Math.min(precipitationProb.length, 24); i++) {
    if (nowHour + i >= 24) break;
    const prob = precipitationProb[i];
    if (prob !== undefined && prob >= 30) {
      const code = weatherCodes[i] ?? 0;
      const desc = WMO_DESCRIPTIONS[code] ?? "Précipitations";
      return {
        type: "rain" as ChangeType,
        startsAt: addHours(isoNow(), i),
        summary: `${desc} probables.`,
        probabilityPercent: prob !== undefined ? Math.min(100, Math.round(prob)) : null,
      };
    }
  }

  return {
    type: "stable" as ChangeType,
    startsAt: null,
    summary: "Pas de changement significatif dans les prochaines heures.",
    probabilityPercent: null,
  };
}

async function normaliserEssential(
  lat: number,
  lon: number,
  accuracyM: number | undefined,
  pool: pg.Pool,
): Promise<EssentialWeather> {
  const now = new Date();
  const generatedAt = now.toISOString();
  const unavailableSources: string[] = [];

  // Résoudre la localisation
  const localisation = resoudreLocalisationMeteo(lat, lon);
  const { lat: latN, lon: lonN } = localisation.normalisee;
  const isGps = accuracyM !== undefined;

  const location: EssentialWeather["location"] = {
    id: isGps ? null : (localisation.pointPreconfigure?.slug ?? null),
    label: isGps
      ? localisation.pointPreconfigure
        ? `Position GPS proche de ${localisation.pointPreconfigure.nom}`
        : `Position GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`
      : (localisation.pointPreconfigure?.label ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`),
    latitude: lat,
    longitude: lon,
    altitudeM: localisation.pointPreconfigure !== null && localisation.pointPreconfigure.slug === "val-aigoual" ? 351 : null,
    accuracyM: accuracyM ?? null,
    source: isGps ? "gps" : "preset",
  };

  // Observation depuis la base (station Météo-France la plus proche)
  let observationTemp: number | null = null;
  let observationAt: string | null = null;
  try {
    const { rows } = await pool.query(
      `select distinct on (num_poste) num_poste, t, humidite, heure_utc
       from series.meteo_horaire
       where num_poste = $1
       order by num_poste, heure_utc desc limit 1`,
      ["07630"],
    );
    const row = rows[0] as { t: number; heure_utc: string } | undefined;
    if (row && row.t !== null) {
      observationTemp = row.t;
      observationAt = row.heure_utc;
    } else {
      unavailableSources.push("Observations Météo-France");
    }
  } catch {
    unavailableSources.push("Observations Météo-France");
  }
  const observationMinutes = observationAt
    ? (now.getTime() - new Date(observationAt).getTime()) / 60_000
    : Infinity;
  const stale = observationMinutes > 120;

  // Prévisions Open-Meteo
  let weatherData: unknown = null;
  try {
    weatherData = await fetchJson(meteoFranceUrl(latN, lonN));
  } catch {
    unavailableSources.push("Modèles Météo-France (AROME/ARPEGE)");
  }

  const currentData = weatherData ? (weatherData as Record<string, unknown>).current : null;
  const hourlyData = weatherData ? (weatherData as Record<string, unknown>).hourly : null;
  const dailyData = weatherData ? (weatherData as Record<string, unknown>).daily : null;

  const hourlyTempsArr = getNumberArray(hourlyData, "temperature_2m");
  const hourlyRainArr = getNumberArray(hourlyData, "precipitation_probability");
  const hourlyWindArr = getNumberArray(hourlyData, "wind_gusts_10m");
  const weatherCodesArr = getNumberArray(hourlyData, "weather_code");

  const currentTempC =
    observationTemp ??
    getNumber(currentData, "temperature_2m") ??
    hourlyTempsArr[0] ??
    0;
  const currentApparentC =
    observationTemp !== null
      ? (observationTemp + (getNumber(currentData, "apparent_temperature") ?? observationTemp)) / 2
      : (getNumber(currentData, "apparent_temperature") ?? currentTempC);
  const currentWeatherCode = getNumber(currentData, "weather_code");
  const weatherLabel = weatherCodeLabel(currentWeatherCode ?? weatherCodesArr[0] ?? null);

  const current: EssentialWeather["current"] = {
    temperatureC: Math.round(currentTempC * 10) / 10,
    apparentTemperatureC: Math.round(currentApparentC * 10) / 10,
    weatherLabel,
    observedAt: observationAt ?? generatedAt,
    nature: observationMinutes < 60 ? "observation" : "model",
    sourceLabel: observationMinutes < 60
      ? "Station Météo-France Mont Aigoual"
      : "AROME HD via Open-Meteo",
    stale,
  };

  // Min/Max du jour
  const dailyMaxArr = getNumberArray(dailyData, "temperature_2m_max");
  const dailyMinArr = getNumberArray(dailyData, "temperature_2m_min");
  const maxC = getNumber(currentData, "temperature_2m") ?? dailyMaxArr[0] ?? currentTempC;
  const minC = dailyMinArr[0] ?? currentTempC;

  const today: EssentialWeather["today"] = {
    minimumC: Math.round(Math.min(currentTempC, minC as number) * 10) / 10,
    maximumC: Math.round(Math.max(currentTempC, maxC as number) * 10) / 10,
  };

  // Prochain changement
  const nextChange = determinerNextChange(hourlyData);

  // Prochaines heures
  const nextHours: EssentialWeather["nextHours"] = [];
  for (let i = 0; i < Math.min(hourlyTempsArr.length, 6); i++) {
    if (i === 0 && observationMinutes < 30) continue;
    const idx = i === 0 && observationMinutes < 30 ? 1 : i;
    if (idx >= hourlyTempsArr.length) break;
    nextHours.push({
      at: addHours(generatedAt, idx),
      temperatureC: Math.round((hourlyTempsArr[idx] ?? currentTempC) * 10) / 10,
      rainProbabilityPercent: Math.min(100, Math.max(0, Math.round(hourlyRainArr[idx] ?? 0))),
      windGustKmh: Math.round((hourlyWindArr[idx] ?? 0) * 10) / 10,
    });
  }
  if (nextHours.length === 0) {
    nextHours.push({
      at: addHours(generatedAt, 1),
      temperatureC: Math.round(currentTempC * 10) / 10,
      rainProbabilityPercent: 0,
      windGustKmh: 0,
    });
  }

  // Vigilance — détermination du département
  const codeDepartement = localisation.pointPreconfigure?.slug === "marseille" ? "13" : "30";
  const vigilance = await recupererVigilance(codeDepartement);
  const alert: EssentialWeather["alert"] = {
    level: vigilance.niveau,
    title: vigilance.indisponible
      ? "Vigilance Météo-France indisponible"
      : vigilance.niveau === "green"
        ? "Aucune vigilance particulière"
        : `Vigilance ${vigilance.niveau}`,
    phenomena: vigilance.phenomenes,
    validUntil: addHours(generatedAt, 24),
    sourceUrl: "https://vigilance.meteofrance.fr/fr",
    indisponible: vigilance.indisponible,
  };

  return {
    location,
    current,
    today,
    nextChange,
    nextHours,
    alert,
    unavailableSources,
    generatedAt,
  };
}

/* ────────── routes ────────── */

export function registerMeteoV1Routes(app: FastifyInstance, _pool: pg.Pool): void {
  // Liste des lieux rapides
  app.get("/api/v1/meteo/locations", async (_req: FastifyRequest, reply: FastifyReply) => {
    const locations: LocationSummary[] = POINTS_METEO_PRECONFIGURES.map((p) => ({
      id: p.slug,
      label: p.label,
      shortLabel: p.nom,
      latitude: p.lat,
      longitude: p.lon,
    }));
    reply.header("cache-control", "public, max-age=3600");
    return { locations };
  });

  // Météo essentielle
  app.get<{ Querystring: { lat?: string; lon?: string; accuracyM?: string } }>(
    "/api/v1/meteo/essential",
    async (req, reply) => {
      const coordonnees = validerCoordonnees(req.query.lat, req.query.lon);
      if (!coordonnees) {
        reply.code(400);
        return { error: "Coordonnées lat/lon invalides. Latitude -90..90, longitude -180..180." };
      }

      const accuracyM = req.query.accuracyM !== undefined ? Number(req.query.accuracyM) : undefined;

      try {
        const essential = await normaliserEssential(
          coordonnees.lat,
          coordonnees.lon,
          accuracyM,
          _pool,
        );
        reply.header("cache-control", "public, max-age=300");
        return essential;
      } catch (err) {
        req.log.error({ err, lat: coordonnees.lat, lon: coordonnees.lon }, "Erreur météo essentielle");
        reply.code(503);
        return {
          error: "Aucune donnée météo exploitable.",
          unavailableSources: ["Toutes les sources"],
          generatedAt: new Date().toISOString(),
        };
      }
    },
  );
}
