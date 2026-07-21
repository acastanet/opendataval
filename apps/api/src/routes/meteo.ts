import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { PNG } from "pngjs";
import {
  STATIONS_METEO,
  STATIONS_PAR_ID,
  TERRITOIRE,
  resoudreLocalisationMeteo,
  stationsMeteoFrance,
  type CoordonneesMeteo,
  type LocalisationMeteoResolue,
} from "@opendata-vda/shared";
import { distanceKm, resumerEnsemble, validerCoordonnees } from "../lib/meteoPoint.js";
import {
  cheminFrameValide,
  construireFramesRadar,
  derniereFramePassee,
  hoteRadar,
  intensiteVoisinage,
  tuilePourPoint,
  urlTuileCarte,
  urlTuileEchantillon,
  type IntensiteRadar,
} from "../lib/radar.js";

const NUM_POSTE = TERRITOIRE.stationMeteo.numPoste;

const URL_PREVISIONS =
  "https://api.open-meteo.com/v1/meteofrance" +
  `?latitude=${TERRITOIRE.montAigoual.lat}&longitude=${TERRITOIRE.montAigoual.lon}` +
  `&elevation=${TERRITOIRE.stationMeteo.altitudeM}&timezone=Europe%2FParis&forecast_days=7` +
  "&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,weather_code" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max";

const TTL_PREVISIONS_MS = 30 * 60 * 1000;
let cachePrevisions: { expiresAt: number; data: unknown } | null = null;

const TTL_POINT_MS = 10 * 60 * 1000;
const MAX_CACHE_POINTS = 80;
const cachePoints = new Map<string, { expiresAt: number; data: ReponseMeteoPoint }>();

const URL_VIGILANCE = "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";
const TTL_VIGILANCE_MS = 30 * 60 * 1000;
let cacheVigilance: { expiresAt: number; data: unknown } | null = null;

const URL_RADAR_MAPS = "https://api.rainviewer.com/public/weather-maps.json";
const TTL_RADAR_MAPS_MS = 2 * 60 * 1000;
const TTL_RADAR_POINT_MS = 2 * 60 * 1000;
const ZOOM_ECHANTILLON_RADAR = 9;
const MAX_CACHE_RADAR_POINTS = 200;
let cacheRadarMaps: { expiresAt: number; data: unknown } | null = null;
const cacheRadarPoint = new Map<string, { expiresAt: number; data: IntensiteRadar }>();

const COULEUR_VIGILANCE: Record<number, VigilanceGard["couleurMax"]> = {
  1: "vert",
  2: "jaune",
  3: "orange",
  4: "rouge",
};

const PHENOMENE_VIGILANCE: Record<string, string> = {
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

interface ReponseMeteoPoint {
  localisation: {
    type: LocalisationMeteoResolue["type"];
    demandee: { lat: number; lon: number };
    normalisee: { lat: number; lon: number };
    pointPreconfigure: { slug: string; nom: string } | null;
    dansTerritoire: boolean;
  };
  genereLe: string;
  observation: ObservationPoint | null;
  courtTerme: SourceModele | null;
  moyenTerme: (SourceModele & { ensemble: ReturnType<typeof resumerEnsemble> }) | null;
  qualiteAir: SourceQualiteAir | null;
  vigilance: VigilanceGard;
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

interface PhenomeneVigilance {
  id: string;
  nom: string;
  couleur: VigilanceGard["couleurMax"];
}

interface PeriodeVigilance {
  echeance: "J" | "J1";
  debut: string | null;
  fin: string | null;
  couleurMax: VigilanceGard["couleurMax"];
  phenomenes: PhenomeneVigilance[];
}

interface VigilanceGard {
  departement: string;
  code: string;
  url: string;
  miseAJour: string | null;
  couleurMax: "vert" | "jaune" | "orange" | "rouge";
  periodes: PeriodeVigilance[];
  indisponible: boolean;
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

function memoriserPoint(cle: string, data: ReponseMeteoPoint): void {
  cachePoints.set(cle, { expiresAt: Date.now() + TTL_POINT_MS, data });
  if (cachePoints.size <= MAX_CACHE_POINTS) return;
  const plusAncienne = cachePoints.keys().next().value as string | undefined;
  if (plusAncienne) cachePoints.delete(plusAncienne);
}

function localisationPourReponse(
  localisation: LocalisationMeteoResolue,
  dansTerritoire: boolean,
): ReponseMeteoPoint["localisation"] {
  return {
    type: localisation.type,
    demandee: localisation.demandee,
    normalisee: localisation.normalisee,
    pointPreconfigure: localisation.pointPreconfigure
      ? { slug: localisation.pointPreconfigure.slug, nom: localisation.pointPreconfigure.nom }
      : null,
    dansTerritoire,
  };
}

function avecCoordonneesDemandees(
  data: ReponseMeteoPoint,
  demandee: CoordonneesMeteo,
): ReponseMeteoPoint {
  return {
    ...data,
    localisation: { ...data.localisation, demandee },
  };
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

const ORDRE_COULEUR: Record<VigilanceGard["couleurMax"], number> = { vert: 1, jaune: 2, orange: 3, rouge: 4 };

function couleurDepuisId(id: number): VigilanceGard["couleurMax"] {
  return COULEUR_VIGILANCE[id] ?? "vert";
}

function slugDepartement(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function urlVigilanceDept(nom: string): string {
  const slug = slugDepartement(nom);
  return slug ? `https://vigilance.meteofrance.fr/fr/${slug}` : "https://vigilance.meteofrance.fr/fr";
}

function vigilanceIndisponible(code: string, nom: string, perime = false): VigilanceGard {
  return {
    departement: nom,
    code,
    url: urlVigilanceDept(nom),
    miseAJour: null,
    couleurMax: "vert",
    periodes: [],
    indisponible: true,
    perime,
  };
}

// Parse la réponse nationale DPVigilance pour un département donné (domain_id = code INSEE du département).
function parserVigilancePourDept(data: unknown, code: string, nom: string): VigilanceGard {
  const racine = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const produit = racine?.product;
  if (typeof produit !== "object" || produit === null || Array.isArray(produit)) return vigilanceIndisponible(code, nom);

  const periodes = (() => {
    const brutes = Array.isArray((produit as Record<string, unknown>).periods) ? (produit as Record<string, unknown>).periods as unknown[] : [];
    return brutes.map((p): PeriodeVigilance | null => {
      if (typeof p !== "object" || p === null || Array.isArray(p)) return null;
      const periode = p as Record<string, unknown>;
      const echeance = typeof periode.echeance === "string" ? (periode.echeance as "J" | "J1") : null;
      if (echeance !== "J" && echeance !== "J1") return null;

      const debut = typeof periode.begin_validity_time === "string" ? (periode.begin_validity_time as string) : null;
      const fin = typeof periode.end_validity_time === "string" ? (periode.end_validity_time as string) : null;

      const timelaps = typeof periode.timelaps === "object" && periode.timelaps !== null && !Array.isArray(periode.timelaps)
        ? (periode.timelaps as Record<string, unknown>)
        : null;
      const domaines = timelaps && Array.isArray(timelaps.domain_ids) ? timelaps.domain_ids as unknown[] : [];
      const dep = domaines.find((d) => typeof d === "object" && d !== null && !Array.isArray(d) && (d as Record<string, unknown>).domain_id === code);
      if (!dep) return null;
      const depObj = dep as Record<string, unknown>;
      const couleurMax = couleurDepuisId(typeof depObj.max_color_id === "number" ? depObj.max_color_id : 1);

      const phenoms: PhenomeneVigilance[] = [];
      const phenItems = Array.isArray(depObj.phenomenon_items) ? (depObj.phenomenon_items as unknown[]) : [];
      for (const pi of phenItems) {
        if (typeof pi !== "object" || pi === null || Array.isArray(pi)) continue;
        const pItem = pi as Record<string, unknown>;
        const pId = typeof pItem.phenomenon_id === "string" ? pItem.phenomenon_id : String(pItem.phenomenon_id ?? "");
        if (!pId) continue;
        const pMaxColorId = typeof pItem.phenomenon_max_color_id === "number" ? pItem.phenomenon_max_color_id : 1;
        if (pMaxColorId < 2) continue;
        const nomPheno = PHENOMENE_VIGILANCE[pId] ?? `Phénomène ${pId}`;
        phenoms.push({ id: pId, nom: nomPheno, couleur: couleurDepuisId(pMaxColorId) });
      }
      phenoms.sort((a, b) => (ORDRE_COULEUR[b.couleur] ?? 0) - (ORDRE_COULEUR[a.couleur] ?? 0));

      return { echeance, debut, fin, couleurMax, phenomenes: phenoms };
    }).filter((p): p is PeriodeVigilance => p !== null);
  })();

  const couleurMax: VigilanceGard["couleurMax"] = periodes.length > 0
    ? [...periodes.map((p) => p.couleurMax)].sort((a, b) => (ORDRE_COULEUR[b] ?? 0) - (ORDRE_COULEUR[a] ?? 0))[0] ?? "vert"
    : "vert";

  const produitObj = produit as Record<string, unknown>;
  return {
    departement: nom,
    code,
    url: urlVigilanceDept(nom),
    miseAJour: typeof produitObj.update_time === "string" ? (produitObj.update_time as string) : null,
    couleurMax,
    periodes,
    indisponible: false,
    perime: false,
  };
}

// Récupère (et met en cache 30 min) la carte de vigilance nationale brute. null si pas de token ou échec sans cache.
async function recupererVigilanceBrute(): Promise<{ data: unknown; perime: boolean } | null> {
  const maintenant = Date.now();
  if (cacheVigilance && cacheVigilance.expiresAt > maintenant) {
    return { data: cacheVigilance.data, perime: false };
  }
  const token = process.env.METEOFRANCE_API_TOKEN_VIGILANCE ?? process.env.METEOFRANCE_API_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(URL_VIGILANCE, {
      headers: { apikey: token, "User-Agent": "opendata-vda-api/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`DPVigilance -> HTTP ${res.status}`);
    const data = await res.json();
    cacheVigilance = { expiresAt: maintenant + TTL_VIGILANCE_MS, data };
    return { data, perime: false };
  } catch {
    if (cacheVigilance) return { data: cacheVigilance.data, perime: true };
    return null;
  }
}

// Département depuis un code INSEE commune (2 chiffres, sauf Corse 2A/2B et DOM 97x/98x).
function codeDepartementDepuisInsee(insee: string): string | null {
  const p2 = insee.slice(0, 2).toUpperCase();
  if (p2 === "2A" || p2 === "2B") return p2;
  if (p2 === "97" || p2 === "98") return insee.slice(0, 3);
  if (/^\d{2}$/.test(p2)) return p2;
  return null;
}

// Le géocodage inverse BAN/IGN renvoie un `context` "30, Gard, Occitanie" → code + nom du département.
function extraireDepartement(data: unknown): { code: string; nom: string } | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const features = (data as Record<string, unknown>).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const premier = features[0];
  if (typeof premier !== "object" || premier === null || Array.isArray(premier)) return null;
  const props = (premier as Record<string, unknown>).properties;
  if (typeof props !== "object" || props === null || Array.isArray(props)) return null;
  const p = props as Record<string, unknown>;
  const context = typeof p.context === "string" ? p.context : null;
  if (context) {
    const [code, nom] = context.split(",").map((m) => m.trim());
    if (code && nom) return { code, nom };
  }
  const citycode = typeof p.citycode === "string" ? p.citycode : null;
  if (citycode) {
    const code = codeDepartementDepuisInsee(citycode);
    if (code) return { code, nom: code };
  }
  return null;
}

async function departementPourPoint(lat: number, lon: number): Promise<{ code: string; nom: string } | null> {
  try {
    const url = new URL("https://data.geopf.fr/geocodage/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("limit", "1");
    return extraireDepartement(await fetchJson(url.toString()));
  } catch {
    return null;
  }
}

// Vigilance du département contenant le point. Chemin rapide pour le territoire (Gard), sinon géocodage inverse.
// Renvoie toujours un objet (jamais null) : le bandeau doit rester affiché ; repli sur le Gard si le
// département du point ne peut être résolu (portail territorial Val-d'Aigoual).
const DEPT_DEFAUT = { code: "30", nom: "Gard" };

async function recupererVigilancePoint(lat: number, lon: number, dansTerritoire: boolean): Promise<VigilanceGard> {
  const dept = dansTerritoire ? DEPT_DEFAUT : (await departementPourPoint(lat, lon)) ?? DEPT_DEFAUT;
  const brute = await recupererVigilanceBrute();
  if (!brute) return vigilanceIndisponible(dept.code, dept.nom);
  return { ...parserVigilancePourDept(brute.data, dept.code, dept.nom), perime: brute.perime };
}

async function recupererRadarMaps(): Promise<unknown> {
  const maintenant = Date.now();
  if (cacheRadarMaps && cacheRadarMaps.expiresAt > maintenant) return cacheRadarMaps.data;
  const res = await fetch(URL_RADAR_MAPS, {
    headers: { "User-Agent": "opendata-vda-api/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`RainViewer -> HTTP ${res.status}`);
  const data = await res.json();
  cacheRadarMaps = { expiresAt: maintenant + TTL_RADAR_MAPS_MS, data };
  return data;
}

async function echantillonnerRadar(data: unknown, lat: number, lon: number): Promise<{ intensite: IntensiteRadar; frameTime: number } | null> {
  const frame = derniereFramePassee(data);
  if (!frame) return null;
  const { z, x, y, px, py } = tuilePourPoint(lat, lon, ZOOM_ECHANTILLON_RADAR);
  const cle = `${z}/${x}/${y}/${frame.time}`;
  const enCache = cacheRadarPoint.get(cle);
  if (enCache && enCache.expiresAt > Date.now()) return { intensite: enCache.data, frameTime: frame.time };

  const url = urlTuileEchantillon(hoteRadar(data), frame.path, z, x, y);
  const res = await fetch(url, { headers: { "User-Agent": "opendata-vda-api/1.0" }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`RainViewer tuile -> HTTP ${res.status}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  const intensite = intensiteVoisinage(png.data, png.width, png.height, px, py);

  cacheRadarPoint.set(cle, { expiresAt: Date.now() + TTL_RADAR_POINT_MS, data: intensite });
  if (cacheRadarPoint.size > MAX_CACHE_RADAR_POINTS) {
    const plusAncienne = cacheRadarPoint.keys().next().value as string | undefined;
    if (plusAncienne) cacheRadarPoint.delete(plusAncienne);
  }
  return { intensite, frameTime: frame.time };
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

    const localisation = resoudreLocalisationMeteo(coordonnees.lat, coordonnees.lon);
    const { lat, lon } = localisation.normalisee;
    const cle = localisation.cleCache;
    const precedent = cachePoints.get(cle);
    if (precedent && precedent.expiresAt > Date.now()) {
      reply.header("cache-control", "public, max-age=300");
      return avecCoordonneesDemandees(precedent.data, localisation.demandee);
    }

    const urlCourtTerme = urlModele("https://api.open-meteo.com/v1/meteofrance", lat, lon, {
      forecast_days: "4",
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,is_day",
      hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,precipitation,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day",
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

    // Vigilance lancée en parallèle du batch météo (peut nécessiter un géocodage inverse hors territoire).
    const vigilancePromise = recupererVigilancePoint(lat, lon, estDansTerritoire(lat, lon));

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
      return avecCoordonneesDemandees(
        { ...precedent.data, perime: true, sourcesIndisponibles },
        localisation.demandee,
      );
    }

    const dansTerritoire = estDansTerritoire(lat, lon);
    const meteogramme = new URL("https://charts.ecmwf.int/products/opencharts_meteogram");
    meteogramme.searchParams.set("epsgram", "classical_10d");
    meteogramme.searchParams.set("lat", String(lat));
    meteogramme.searchParams.set("lon", String(lon));
    meteogramme.searchParams.set("station_name", `Point ${lat.toFixed(4)}, ${lon.toFixed(4)}`);

    const data: ReponseMeteoPoint = {
      localisation: localisationPourReponse(localisation, dansTerritoire),
      genereLe: new Date().toISOString(),
      observation: observationResultat.status === "fulfilled" ? observationResultat.value : null,
      courtTerme: courtTermeData ? sourceCourtTerme(courtTermeData) : null,
      moyenTerme: ecmwfData || ensembleData ? sourceMoyenTerme(ecmwfData, ensembleData) : null,
      qualiteAir: qualiteAirData ? sourceQualiteAir(qualiteAirData) : null,
      vigilance: await vigilancePromise,
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

  app.get<{ Querystring: { lat?: string; lon?: string } }>("/api/meteo/radar", async (req, reply) => {
    const coordonnees = validerCoordonnees(req.query.lat, req.query.lon);
    if (!coordonnees) {
      reply.code(400);
      return { error: "coordonnées lat/lon invalides" };
    }

    const { lat, lon } = coordonnees;
    try {
      const data = await recupererRadarMaps();
      const { frames } = construireFramesRadar(data);
      let point: { intensite: IntensiteRadar; frameTime: number } | null = null;
      try {
        point = await echantillonnerRadar(data, lat, lon);
      } catch (err) {
        app.log.warn({ err, lat, lon }, "radar : échantillon au point indisponible");
      }
      reply.header("cache-control", "public, max-age=120");
      return { attribution: "RainViewer", frames, point };
    } catch (err) {
      app.log.warn({ err }, "radar : RainViewer indisponible");
      reply.header("cache-control", "public, max-age=30");
      return { attribution: "RainViewer", frames: [], point: null };
    }
  });

  // Proxy des tuiles radar : les sert en même origine (RainViewer n'envoie pas de CORS, requis par MapLibre).
  app.get<{ Params: { z: string; x: string; y: string }; Querystring: { path?: string } }>(
    "/api/meteo/radar/tuile/:z/:x/:y",
    async (req, reply) => {
      const z = Number(req.params.z);
      const x = Number(req.params.x);
      const y = Number(req.params.y);
      const chemin = req.query.path ?? "";
      const entiersValides = [z, x, y].every((v) => Number.isInteger(v) && v >= 0) && z <= 15;
      if (!entiersValides || !cheminFrameValide(chemin)) {
        reply.code(400);
        return { error: "paramètres de tuile radar invalides" };
      }
      try {
        const res = await fetch(urlTuileCarte(chemin, z, x, y), {
          headers: { "User-Agent": "opendata-vda-api/1.0" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          reply.code(502);
          return { error: "tuile radar indisponible" };
        }
        reply.header("content-type", "image/png");
        reply.header("cache-control", "public, max-age=600");
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        app.log.warn({ err, chemin }, "radar : proxy de tuile en échec");
        reply.code(502);
        return { error: "tuile radar indisponible" };
      }
    },
  );

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
