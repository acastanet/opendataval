import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { STATIONS_METEO, STATIONS_PAR_ID, TERRITOIRE, stationsMeteoFrance } from "@opendata-vda/shared";
import { distanceKm, resumerEnsemble, validerCoordonnees } from "../lib/meteoPoint.js";

const NUM_POSTE = TERRITOIRE.stationMeteo.numPoste;

const URL_PREVISIONS =
  "https://api.open-meteo.com/v1/meteofrance" +
  `?latitude=${TERRITOIRE.montAigoual.lat}&longitude=${TERRITOIRE.montAigoual.lon}` +
  `&elevation=${TERRITOIRE.stationMeteo.altitudeM}&timezone=Europe%2FParis&forecast_days=7` +
  "&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,weather_code" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max";

const TTL_PREVISIONS_MS = 30 * 60 * 1000;
let cachePrevisions: { expiresAt: number; data: unknown } | null = null;

const TTL_POINT_MS = 20 * 60 * 1000;
const MAX_CACHE_POINTS = 80;
const cachePoints = new Map<string, { expiresAt: number; data: ReponseMeteoPoint }>();

interface ReponseMeteoPoint {
  localisation: {
    demandee: { lat: number; lon: number };
    dansTerritoire: boolean;
  };
  genereLe: string;
  observation: ObservationPoint | null;
  courtTerme: SourceModele | null;
  moyenTerme: (SourceModele & { ensemble: ReturnType<typeof resumerEnsemble> }) | null;
  qualiteAir: SourceQualiteAir | null;
  vigilance: { departement: string; code: string; url: string } | null;
  liens: { ecmwf: string; meteoFrance: string | null };
  sourcesIndisponibles: string[];
  perime: boolean;
}

interface SourceModele {
  fournisseur: string;
  modele: string;
  statut: "modele-officiel-diffusion-tierce";
  resolution: string;
  horizon: string;
  pointModele: { lat: number | null; lon: number | null; altitudeM: number | null };
  current?: unknown;
  hourly?: unknown;
  daily: unknown;
}

interface SourceQualiteAir {
  fournisseur: string;
  modele: string;
  statut: "modele-officiel-diffusion-tierce";
  resolution: string;
  pointModele: { lat: number | null; lon: number | null };
  current: unknown;
  hourly: unknown;
}

interface LieuGeocode {
  label: string;
  nom: string;
  commune: string | null;
  codePostal: string | null;
  type: string | null;
  score: number | null;
  distanceM: number | null;
  lat: number;
  lon: number;
  source: "Géoplateforme IGN / Base Adresse Nationale";
}

interface ObservationPoint {
  station: {
    id: string;
    nom: string;
    altitudeM: number;
    distanceKm: number;
    reseau: "meteofrance";
    licence: string;
  };
  mesure: Record<string, unknown> | null;
  perime: boolean;
}

function valeurNumerique(objet: unknown, cle: string): number | null {
  if (typeof objet !== "object" || objet === null || Array.isArray(objet)) return null;
  const valeur = (objet as Record<string, unknown>)[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "opendata-vda-api/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function urlModele(base: string, lat: number, lon: number, parametres: Record<string, string>): string {
  const url = new URL(base);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", "Europe/Paris");
  for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
  return url.toString();
}

function extraireBloc(objet: unknown, cle: string): unknown {
  if (typeof objet !== "object" || objet === null || Array.isArray(objet)) return null;
  return (objet as Record<string, unknown>)[cle] ?? null;
}

function sourceCourtTerme(data: unknown): SourceModele {
  return {
    fournisseur: "Open-Meteo",
    modele: "Météo-France AROME HD / AROME, puis ARPEGE",
    statut: "modele-officiel-diffusion-tierce",
    resolution: "1,5 à 2,5 km jusqu'à 48 h, puis 11 à 25 km",
    horizon: "0 à 4 jours",
    pointModele: {
      lat: valeurNumerique(data, "latitude"),
      lon: valeurNumerique(data, "longitude"),
      altitudeM: valeurNumerique(data, "elevation"),
    },
    current: extraireBloc(data, "current"),
    hourly: extraireBloc(data, "hourly"),
    daily: extraireBloc(data, "daily"),
  };
}

function sourceQualiteAir(data: unknown): SourceQualiteAir {
  return {
    fournisseur: "Open-Meteo",
    modele: "Copernicus CAMS European Air Quality Ensemble",
    statut: "modele-officiel-diffusion-tierce",
    resolution: "environ 11 km",
    pointModele: {
      lat: valeurNumerique(data, "latitude"),
      lon: valeurNumerique(data, "longitude"),
    },
    current: extraireBloc(data, "current"),
    hourly: extraireBloc(data, "hourly"),
  };
}

function normaliserLieu(feature: unknown): LieuGeocode | null {
  if (typeof feature !== "object" || feature === null || Array.isArray(feature)) return null;
  const objet = feature as Record<string, unknown>;
  const geometry = objet.geometry;
  const properties = objet.properties;
  if (typeof geometry !== "object" || geometry === null || Array.isArray(geometry)) return null;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) return null;
  const coordonnees = (geometry as Record<string, unknown>).coordinates;
  if (!Array.isArray(coordonnees) || coordonnees.length < 2) return null;
  const lon = Number(coordonnees[0]);
  const lat = Number(coordonnees[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const props = properties as Record<string, unknown>;
  const texte = (cle: string): string | null => typeof props[cle] === "string" ? props[cle] as string : null;
  const nombre = (cle: string): number | null => typeof props[cle] === "number" && Number.isFinite(props[cle]) ? props[cle] as number : null;
  const label = texte("label") ?? texte("name") ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  return {
    label,
    nom: texte("name") ?? label,
    commune: texte("city"),
    codePostal: texte("postcode"),
    type: texte("type"),
    score: nombre("score"),
    distanceM: nombre("distance"),
    lat,
    lon,
    source: "Géoplateforme IGN / Base Adresse Nationale",
  };
}

function extraireLieux(data: unknown): LieuGeocode[] {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
  const features = (data as Record<string, unknown>).features;
  if (!Array.isArray(features)) return [];
  return features.map(normaliserLieu).filter((lieu): lieu is LieuGeocode => lieu !== null);
}

function sourceMoyenTerme(deterministe: unknown, ensemble: unknown): ReponseMeteoPoint["moyenTerme"] {
  const point = deterministe ?? ensemble;
  return {
    fournisseur: "ECMWF via Open-Meteo",
    modele: "IFS HRES 9 km + IFS ENS 51 scénarios à 0,25°",
    statut: "modele-officiel-diffusion-tierce",
    resolution: "9 km (scénario central) et environ 25 km (ensemble)",
    horizon: "jusqu'à 10 jours dans ce MVP",
    pointModele: {
      lat: valeurNumerique(point, "latitude"),
      lon: valeurNumerique(point, "longitude"),
      altitudeM: valeurNumerique(point, "elevation"),
    },
    daily: extraireBloc(deterministe, "daily"),
    ensemble: resumerEnsemble(ensemble),
  };
}

async function observationLaPlusProche(pool: pg.Pool, lat: number, lon: number): Promise<ObservationPoint | null> {
  const stations = stationsMeteoFrance()
    .map((station) => ({ station, distance: distanceKm({ lat, lon }, station) }))
    .sort((a, b) => a.distance - b.distance);
  if (!stations.length) return null;

  const ids = stations.map(({ station }) => station.id);
  const { rows } = await pool.query(
    `select distinct on (num_poste) num_poste, heure_utc, t, humidite, vent_dir, vent_kmh,
            rafale_kmh, pluie_1h_mm, pression_hpa, neige_cm
     from series.meteo_horaire
     where num_poste = any($1)
     order by num_poste, heure_utc desc`,
    [ids],
  );
  const mesures = new Map(rows.map((row) => [String(row.num_poste), row as Record<string, unknown>]));
  const maintenant = Date.now();
  const avecMesureRecente = stations.find(({ station }) => {
    const mesure = mesures.get(station.id);
    const date = mesure?.heure_utc;
    const timestamp = date instanceof Date ? date.getTime() : typeof date === "string" ? Date.parse(date) : Number.NaN;
    return Number.isFinite(timestamp) && maintenant - timestamp <= 3 * 60 * 60 * 1000;
  });
  const selection = avecMesureRecente ?? stations[0];
  if (!selection) return null;
  const mesure = mesures.get(selection.station.id) ?? null;
  const date = mesure?.heure_utc;
  const timestamp = date instanceof Date ? date.getTime() : typeof date === "string" ? Date.parse(date) : Number.NaN;

  return {
    station: {
      id: selection.station.id,
      nom: selection.station.nom,
      altitudeM: selection.station.altitudeM,
      distanceKm: Math.round(selection.distance * 10) / 10,
      reseau: "meteofrance",
      licence: selection.station.licence,
    },
    mesure,
    perime: !Number.isFinite(timestamp) || maintenant - timestamp > 3 * 60 * 60 * 1000,
  };
}

function estDansTerritoire(lat: number, lon: number): boolean {
  const [ouest, sud, est, nord] = TERRITOIRE.bbox;
  return lon >= ouest && lon <= est && lat >= sud && lat <= nord;
}

function clePoint(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function memoriserPoint(cle: string, data: ReponseMeteoPoint): void {
  cachePoints.set(cle, { expiresAt: Date.now() + TTL_POINT_MS, data });
  if (cachePoints.size <= MAX_CACHE_POINTS) return;
  const plusAncienne = cachePoints.keys().next().value as string | undefined;
  if (plusAncienne) cachePoints.delete(plusAncienne);
}

async function recupererPrevisions(): Promise<{ data: unknown; perime: boolean }> {
  const maintenant = Date.now();
  if (cachePrevisions && cachePrevisions.expiresAt > maintenant) {
    return { data: cachePrevisions.data, perime: false };
  }
  try {
    const res = await fetch(URL_PREVISIONS, { headers: { "User-Agent": "opendata-vda-api/1.0" } });
    if (!res.ok) throw new Error(`Open-Meteo -> HTTP ${res.status}`);
    const data = await res.json();
    cachePrevisions = { expiresAt: maintenant + TTL_PREVISIONS_MS, data };
    return { data, perime: false };
  } catch (err) {
    if (cachePrevisions) return { data: cachePrevisions.data, perime: true };
    throw err;
  }
}

export function registerMeteoRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get("/api/meteo/stations", async (_req, reply) => {
    const ids = STATIONS_METEO.map((s) => s.id);
    const { rows } = await pool.query(
      `select distinct on (num_poste) num_poste, heure_utc, t, humidite, vent_dir, vent_kmh, rafale_kmh, pluie_1h_mm, neige_cm
       from series.meteo_horaire
       where num_poste = any($1) and heure_utc >= now() - interval '3 hours'
       order by num_poste, heure_utc desc`,
      [ids],
    );
    const dernieresParId = new Map(rows.map((r) => [r.num_poste as string, r]));

    const stations = STATIONS_METEO.map((s) => {
      const d = dernieresParId.get(s.id);
      return {
        id: s.id,
        nom: s.nom,
        altitudeM: s.altitudeM,
        lon: s.lon,
        lat: s.lat,
        reseau: s.reseau,
        pack: s.pack ?? null,
        licence: s.licence,
        derniere: d
          ? {
              heure_utc: d.heure_utc,
              t: d.t,
              humidite: d.humidite,
              vent_dir: d.vent_dir,
              vent_kmh: d.vent_kmh,
              rafale_kmh: d.rafale_kmh,
              pluie_1h_mm: d.pluie_1h_mm,
              neige_cm: d.neige_cm,
            }
          : null,
      };
    }).sort((a, b) => b.altitudeM - a.altitudeM);

    reply.header("cache-control", "public, max-age=120");
    return { stations };
  });

  app.get<{ Querystring: { station?: string } }>("/api/meteo/temps-reel", async (req, reply) => {
    const id = req.query.station ?? NUM_POSTE;
    const station = STATIONS_PAR_ID.get(id);
    if (!station) {
      reply.code(404);
      return { error: "station inconnue" };
    }

    const { rows: historique } = await pool.query(
      `select distinct on (date_trunc('hour', heure_utc)) heure_utc, t, humidite, vent_dir, vent_kmh, rafale_kmh, pluie_1h_mm, pression_hpa, neige_cm
       from series.meteo_horaire
       where num_poste = $1 and heure_utc >= now() - interval '48 hours'
       order by date_trunc('hour', heure_utc), (extract(minute from heure_utc) = 0) desc, heure_utc desc`,
      [id],
    );

    const { rows: dernièreRows } = await pool.query(
      `select heure_utc, t, humidite, vent_dir, vent_kmh, rafale_kmh, pluie_1h_mm, pression_hpa, neige_cm
       from series.meteo_horaire where num_poste = $1 order by heure_utc desc limit 1`,
      [id],
    );
    const derniere = dernièreRows[0] ?? null;

    // Les lignes infra-horaires (6 min) n'ont pas de pluie_1h_mm : on récupère la dernière valeur connue.
    if (derniere && derniere.pluie_1h_mm === null) {
      const { rows: pluieRows } = await pool.query(
        `select pluie_1h_mm from series.meteo_horaire
         where num_poste = $1 and pluie_1h_mm is not null and heure_utc >= now() - interval '90 minutes'
         order by heure_utc desc limit 1`,
        [id],
      );
      if (pluieRows[0]) derniere.pluie_1h_mm = pluieRows[0].pluie_1h_mm;
    }

    reply.header("cache-control", "public, max-age=300");
    return {
      station: {
        numPoste: station.id,
        id: station.id,
        nom: station.nom,
        altitudeM: station.altitudeM,
        reseau: station.reseau,
        pack: station.pack ?? null,
        licence: station.licence,
      },
      derniere,
      historique,
    };
  });

  app.get("/api/meteo/previsions", async (_req, reply) => {
    try {
      const { data, perime } = await recupererPrevisions();
      reply.header("cache-control", "public, max-age=1800");
      return { ...(data as object), source: "open-meteo.com", perime };
    } catch (err) {
      reply.code(502);
      return { error: "prévisions indisponibles", detail: (err as Error).message };
    }
  });

  app.get<{ Querystring: { q?: string } }>("/api/meteo/lieux", async (req, reply) => {
    const q = req.query.q?.trim() ?? "";
    if (q.length < 2 || q.length > 120) return { lieux: [] };

    try {
      const url = new URL("https://data.geopf.fr/geocodage/search");
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "8");
      url.searchParams.set("autocomplete", "1");
      const lieux = extraireLieux(await fetchJson(url.toString())).slice(0, 6);
      reply.header("cache-control", "public, max-age=3600");
      return { lieux, attribution: "Géoplateforme IGN / Base Adresse Nationale" };
    } catch (err) {
      app.log.warn({ err, q }, "géocodage : recherche indisponible");
      reply.code(502);
      return { error: "recherche d’adresse indisponible", lieux: [] };
    }
  });

  app.get<{ Querystring: { lat?: string; lon?: string } }>("/api/meteo/localisation", async (req, reply) => {
    const coordonnees = validerCoordonnees(req.query.lat, req.query.lon);
    if (!coordonnees) {
      reply.code(400);
      return { error: "coordonnées lat/lon invalides" };
    }

    const { lat, lon } = coordonnees;
    try {
      const url = new URL("https://data.geopf.fr/geocodage/reverse");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("limit", "1");
      const lieu = extraireLieux(await fetchJson(url.toString()))[0] ?? null;
      reply.header("cache-control", "public, max-age=86400");
      return { lieu, attribution: "Géoplateforme IGN / Base Adresse Nationale" };
    } catch (err) {
      app.log.warn({ err, lat, lon }, "géocodage inverse indisponible");
      reply.code(502);
      return { error: "localisation précise indisponible", lieu: null };
    }
  });

  app.get<{ Querystring: { lat?: string; lon?: string } }>("/api/meteo/point", async (req, reply) => {
    const coordonnees = validerCoordonnees(req.query.lat, req.query.lon);
    if (!coordonnees) {
      reply.code(400);
      return { error: "coordonnées lat/lon invalides" };
    }

    const { lat, lon } = coordonnees;
    const cle = clePoint(lat, lon);
    const precedent = cachePoints.get(cle);
    if (precedent && precedent.expiresAt > Date.now()) {
      reply.header("cache-control", "public, max-age=300");
      return precedent.data;
    }

    const urlCourtTerme = urlModele("https://api.open-meteo.com/v1/meteofrance", lat, lon, {
      forecast_days: "4",
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure",
      hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,precipitation,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max",
    });
    const urlEcmwf = urlModele("https://api.open-meteo.com/v1/ecmwf", lat, lon, {
      models: "ecmwf_ifs",
      forecast_days: "10",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max",
    });
    const urlEcmwfEnsemble = urlModele("https://ensemble-api.open-meteo.com/v1/ensemble", lat, lon, {
      models: "ecmwf_ifs025",
      forecast_days: "10",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max",
    });
    const urlQualiteAir = urlModele("https://air-quality-api.open-meteo.com/v1/air-quality", lat, lon, {
      domains: "cams_europe",
      forecast_days: "4",
      current: "european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone",
      hourly: "european_aqi",
    });

    const [observationResultat, courtTermeResultat, ecmwfResultat, ensembleResultat, qualiteAirResultat] = await Promise.allSettled([
      observationLaPlusProche(pool, lat, lon),
      fetchJson(urlCourtTerme),
      fetchJson(urlEcmwf),
      fetchJson(urlEcmwfEnsemble),
      fetchJson(urlQualiteAir),
    ]);

    const sourcesIndisponibles: string[] = [];
    if (observationResultat.status === "rejected") sourcesIndisponibles.push("observations Météo-France");
    if (courtTermeResultat.status === "rejected") sourcesIndisponibles.push("modèles Météo-France");
    if (ecmwfResultat.status === "rejected") sourcesIndisponibles.push("ECMWF déterministe");
    if (ensembleResultat.status === "rejected") sourcesIndisponibles.push("ECMWF ensemble");
    if (qualiteAirResultat.status === "rejected") sourcesIndisponibles.push("qualité de l’air Copernicus CAMS");
    if (sourcesIndisponibles.length) {
      app.log.warn({ sourcesIndisponibles, lat, lon }, "météo point : réponse partielle");
    }

    const courtTermeData = courtTermeResultat.status === "fulfilled" ? courtTermeResultat.value : null;
    const ecmwfData = ecmwfResultat.status === "fulfilled" ? ecmwfResultat.value : null;
    const ensembleData = ensembleResultat.status === "fulfilled" ? ensembleResultat.value : null;
    const qualiteAirData = qualiteAirResultat.status === "fulfilled" ? qualiteAirResultat.value : null;

    if (!courtTermeData && !ecmwfData && !ensembleData && precedent) {
      reply.header("cache-control", "public, max-age=60");
      return { ...precedent.data, perime: true, sourcesIndisponibles };
    }

    const dansTerritoire = estDansTerritoire(lat, lon);
    const meteogramme = new URL("https://charts.ecmwf.int/products/opencharts_meteogram");
    meteogramme.searchParams.set("epsgram", "classical_10d");
    meteogramme.searchParams.set("lat", String(lat));
    meteogramme.searchParams.set("lon", String(lon));
    meteogramme.searchParams.set("station_name", `Point ${lat.toFixed(4)}, ${lon.toFixed(4)}`);

    const data: ReponseMeteoPoint = {
      localisation: { demandee: { lat, lon }, dansTerritoire },
      genereLe: new Date().toISOString(),
      observation: observationResultat.status === "fulfilled" ? observationResultat.value : null,
      courtTerme: courtTermeData ? sourceCourtTerme(courtTermeData) : null,
      moyenTerme: ecmwfData || ensembleData ? sourceMoyenTerme(ecmwfData, ensembleData) : null,
      qualiteAir: qualiteAirData ? sourceQualiteAir(qualiteAirData) : null,
      vigilance: dansTerritoire
        ? {
            departement: "Gard",
            code: "30",
            url: "https://vigilance.meteofrance.fr/fr/gard",
          }
        : null,
      liens: {
        ecmwf: meteogramme.toString(),
        meteoFrance: dansTerritoire
          ? "https://previ.meteofrance.com/previsions-meteo-france/val-d-aigoual/30570"
          : null,
      },
      sourcesIndisponibles,
      perime: false,
    };

    memoriserPoint(cle, data);
    reply.header("cache-control", "public, max-age=300");
    return data;
  });

  app.get<{ Querystring: { debut?: string; fin?: string } }>("/api/meteo/climat/normales", async (req, reply) => {
    const debut = Number(req.query.debut ?? 1991);
    const fin = Number(req.query.fin ?? 2020);
    const { rows } = await pool.query(
      `select extract(month from date)::int as mois,
              round(avg(tm)::numeric, 1) as tm,
              round(avg(tn)::numeric, 1) as tn,
              round(avg(tx)::numeric, 1) as tx,
              round((sum(rr) / count(distinct extract(year from date)))::numeric, 0) as rr,
              round((count(*) filter (where tn < 0))::numeric / count(distinct extract(year from date)), 1) as jours_gel
       from series.meteo_quotidien
       where num_poste = $1 and date >= make_date($2, 1, 1) and date <= make_date($3, 12, 31)
       group by 1
       order by 1`,
      [NUM_POSTE, debut, fin],
    );
    reply.header("cache-control", "public, max-age=86400");
    return { periode: { debut, fin }, mois: rows };
  });

  app.get("/api/meteo/climat/annuel", async (_req, reply) => {
    const { rows } = await pool.query(
      `select extract(year from date)::int as annee,
              round(avg(tm)::numeric, 2) as tm,
              round(sum(rr)::numeric, 0) as rr,
              count(*) filter (where tn < 0) as jours_gel,
              round(max(tx)::numeric, 1) as tx_max,
              round(min(tn)::numeric, 1) as tn_min
       from series.meteo_quotidien
       where num_poste = $1
       group by 1
       having count(*) >= 350
       order by 1`,
      [NUM_POSTE],
    );
    reply.header("cache-control", "public, max-age=86400");
    return { annees: rows };
  });

  app.get("/api/meteo/climat/records", async (_req, reply) => {
    const [txMax, tnMin, rrMax, anneeChaude, anneeArrosee] = await Promise.all([
      pool.query(
        `select date, tx as valeur from series.meteo_quotidien
         where num_poste = $1 and tx is not null order by tx desc limit 1`,
        [NUM_POSTE],
      ),
      pool.query(
        `select date, tn as valeur from series.meteo_quotidien
         where num_poste = $1 and tn is not null order by tn asc limit 1`,
        [NUM_POSTE],
      ),
      pool.query(
        `select date, rr as valeur from series.meteo_quotidien
         where num_poste = $1 and rr is not null order by rr desc limit 1`,
        [NUM_POSTE],
      ),
      pool.query(
        `select extract(year from date)::int as annee, round(avg(tm)::numeric, 2) as tm
         from series.meteo_quotidien where num_poste = $1
         group by 1 having count(*) >= 350 order by tm desc limit 1`,
        [NUM_POSTE],
      ),
      pool.query(
        `select extract(year from date)::int as annee, round(sum(rr)::numeric, 0) as rr
         from series.meteo_quotidien where num_poste = $1
         group by 1 having count(*) >= 350 order by rr desc limit 1`,
        [NUM_POSTE],
      ),
    ]);
    reply.header("cache-control", "public, max-age=86400");
    return {
      tx_max: txMax.rows[0] ?? null,
      tn_min: tnMin.rows[0] ?? null,
      rr_max_1j: rrMax.rows[0] ?? null,
      annee_plus_chaude: anneeChaude.rows[0] ?? null,
      annee_plus_arrosee: anneeArrosee.rows[0] ?? null,
    };
  });
}
