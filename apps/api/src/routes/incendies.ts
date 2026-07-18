import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { deserialize } from "flatgeobuf/lib/mjs/geojson.js";

const MASSIFS_GARD_FGB_URL = "https://www.risque-prevention-incendie.fr/static/30/massifs_30.fgb";
const IDS_MASSIFS_AIGOUAL = new Set([301, 302, 303]);
const CACHE_MASSIFS_MS = 6 * 60 * 60 * 1000;

interface MassifGardFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown> | null;
}

let cacheMassifsGard: { expireA: number; features: MassifGardFeature[] } | null = null;

async function chargerMassifsGardOfficiels(): Promise<MassifGardFeature[]> {
  if (cacheMassifsGard && cacheMassifsGard.expireA > Date.now()) return cacheMassifsGard.features;

  const response = await fetch(MASSIFS_GARD_FGB_URL, {
    headers: { "User-Agent": "OpenDataVdA/1.0 (+https://opendata.valdaigoual.fr)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Massifs officiels du Gard -> HTTP ${response.status}`);

  const features: MassifGardFeature[] = [];
  const bytes = new Uint8Array(await response.arrayBuffer());
  for await (const feature of deserialize(bytes)) {
    const massif = feature as MassifGardFeature;
    if (IDS_MASSIFS_AIGOUAL.has(Number(massif.properties?.ID))) features.push(massif);
  }
  if (features.length !== IDS_MASSIFS_AIGOUAL.size) {
    throw new Error(`Massifs officiels du Gard : ${features.length}/3 contours reçus`);
  }

  cacheMassifsGard = { expireA: Date.now() + CACHE_MASSIFS_MS, features };
  return features;
}

interface DetectionQuery {
  hours?: string;
}

interface PointGeometry {
  type: "Point";
  coordinates: [number, number];
}

interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

interface DetectionRow {
  external_id: string;
  observee_a: string;
  satellite: string;
  instrument: string;
  confiance: string | null;
  frp: string | null;
  jour_nuit: "D" | "N" | null;
  position: "coeur" | "proche" | "veille";
  distance_coeur_m: string;
  geometry: PointGeometry;
}

interface ZoneRow {
  slug: string;
  nom: string;
  type_zone: "coeur" | "proche_5km" | "veille_15km" | "officielle";
  source: string;
  version_source: string | null;
  maj: string;
  geometry: MultiPolygonGeometry;
}

interface RiskRow {
  date_validite: string;
  collectee_a: string;
  zone_officielle: string;
  niveau: string;
  restrictions: string | null;
  source_url: string;
}

function resumeRisque(rows: RiskRow[], date: string) {
  const ordre = ["inconnu", "vert", "jaune", "orange", "rouge"];
  const niveauMax = rows.reduce((maximum, risque) => (
    ordre.indexOf(risque.niveau) > ordre.indexOf(maximum) ? risque.niveau : maximum
  ), "inconnu");

  return rows.length === 0
    ? { etat: "indisponible" as const, date_validite: date, niveau_max: "inconnu", zones: [] }
    : { etat: "ok" as const, date_validite: date, niveau_max: niveauMax, zones: rows };
}

function dateParis(decalageJours = 0): string {
  const date = new Date(Date.now() + decalageJours * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const valeur = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${valeur("year")}-${valeur("month")}-${valeur("day")}`;
}

function parseHours(value: string | undefined): number | null {
  if (value === undefined) return 24;
  if (!/^\d+$/.test(value)) return null;
  const hours = Number(value);
  return Number.isInteger(hours) && hours >= 1 && hours <= 72 ? hours : null;
}

export function registerIncendiesRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get("/api/incendies/massifs-officiels", async (_request, reply) => {
    try {
      const features = await chargerMassifsGardOfficiels();
      reply.header("cache-control", "public, max-age=21600");
      return {
        type: "FeatureCollection",
        source: MASSIFS_GARD_FGB_URL,
        features,
      };
    } catch (error) {
      app.log.error(error, "Chargement des contours officiels des massifs gardois impossible");
      reply.code(502);
      return { error: "Les contours officiels des massifs gardois sont temporairement indisponibles." };
    }
  });

  app.get("/api/incendies/situation", async (_request, reply) => {
    const [{ rows: counts }, { rows: firmsLogs }, { rows: risks }, { rows: zones }] = await Promise.all([
      pool.query<{ position: string; nombre: number }>(
        `select position, count(*)::int as nombre
           from incendies.detections_firms
          where observee_a >= now() - interval '24 hours'
          group by position`,
      ),
      pool.query<{ statut: string; termine_a: string | null; erreur: string | null }>(
        `select statut, termine_a, erreur
           from meta.fetch_log where source = 'firms'
          order by demarre_a desc limit 1`,
      ),
      pool.query<RiskRow>(
        `select date_validite, collectee_a, zone_officielle, niveau, restrictions, source_url
           from incendies.risques_officiels
          where departement = 'Gard'
            and date_validite in (
              (now() at time zone 'Europe/Paris')::date,
              ((now() at time zone 'Europe/Paris')::date + 1)
            )
          order by date_validite, zone_officielle`,
      ),
      pool.query<{ nombre: number }>("select count(*)::int as nombre from incendies.zones where slug in ('coeur', 'proche_5km', 'veille_15km')"),
    ]);

    const byPosition = Object.fromEntries(counts.map((count) => [count.position, count.nombre]));
    const latestFirms = firmsLogs[0] ?? null;
    const aujourdhui = dateParis();
    const demain = dateParis(1);
    reply.header("cache-control", "public, max-age=60");
    return {
      detections_24h: {
        coeur: byPosition.coeur ?? 0,
        proche: byPosition.proche ?? 0,
        veille: byPosition.veille ?? 0,
      },
      firms: latestFirms === null
        ? { etat: "non_collecte", derniere_collecte: null }
        : {
            etat: latestFirms.statut,
            derniere_collecte: latestFirms.termine_a,
            erreur: latestFirms.statut === "erreur" ? "La dernière collecte FIRMS a échoué." : undefined,
          },
      risque_gard: {
        aujourd_hui: resumeRisque(risks.filter((risque) => new Date(risque.date_validite).toISOString().slice(0, 10) === aujourdhui), aujourdhui),
        demain: resumeRisque(risks.filter((risque) => new Date(risque.date_validite).toISOString().slice(0, 10) === demain), demain),
      },
      zones_initialisees: zones[0]?.nombre === 3,
    };
  });

  app.get<{ Querystring: DetectionQuery }>("/api/incendies/detections", async (request, reply) => {
    const hours = parseHours(request.query.hours);
    if (hours === null) {
      reply.code(400);
      return { error: "Le paramètre hours doit être un entier compris entre 1 et 72." };
    }

    const { rows } = await pool.query<DetectionRow>(
      `select external_id, observee_a, satellite, instrument, confiance, frp::text, jour_nuit, position,
              round(distance_coeur_m)::text as distance_coeur_m, ST_AsGeoJSON(geom, 6)::json as geometry
         from incendies.detections_firms
        where observee_a >= now() - ($1::text || ' hours')::interval
        order by observee_a desc`,
      [hours],
    );
    reply.header("cache-control", "public, max-age=60");
    return {
      type: "FeatureCollection",
      features: rows.map((row) => ({
        type: "Feature",
        geometry: row.geometry,
        properties: {
          external_id: row.external_id,
          observee_a: row.observee_a,
          satellite: row.satellite,
          instrument: row.instrument,
          confiance: row.confiance,
          frp: row.frp === null ? null : Number(row.frp),
          jour_nuit: row.jour_nuit,
          position: row.position,
          distance_coeur_m: Number(row.distance_coeur_m),
          source_url: "https://firms.modaps.eosdis.nasa.gov/",
        },
      })),
    };
  });

  app.get("/api/incendies/detections/dernieres", async (_request, reply) => {
    const { rows } = await pool.query<DetectionRow>(
      `select external_id, observee_a, satellite, instrument, confiance, frp::text, jour_nuit, position,
              round(distance_coeur_m)::text as distance_coeur_m, ST_AsGeoJSON(geom, 6)::json as geometry
         from incendies.detections_firms
        order by observee_a desc
        limit 3`,
    );
    reply.header("cache-control", "public, max-age=60");
    return {
      type: "FeatureCollection",
      features: rows.map((row) => ({
        type: "Feature",
        geometry: row.geometry,
        properties: {
          external_id: row.external_id,
          observee_a: row.observee_a,
          satellite: row.satellite,
          instrument: row.instrument,
          confiance: row.confiance,
          frp: row.frp === null ? null : Number(row.frp),
          jour_nuit: row.jour_nuit,
          position: row.position,
          distance_coeur_m: Number(row.distance_coeur_m),
          source_url: "https://firms.modaps.eosdis.nasa.gov/",
        },
      })),
    };
  });

  app.get("/api/incendies/zones", async (_request, reply) => {
    const { rows } = await pool.query<ZoneRow>(
      `select slug, nom, type_zone, source, version_source, maj,
              ST_AsGeoJSON(geom, 6)::json as geometry
         from incendies.zones
        where type_zone in ('coeur', 'proche_5km', 'veille_15km')
        order by case type_zone when 'veille_15km' then 1 when 'proche_5km' then 2 else 3 end`,
    );
    reply.header("cache-control", "public, max-age=3600");
    return {
      type: "FeatureCollection",
      features: rows.map((row) => ({
        type: "Feature",
        geometry: row.geometry,
        properties: {
          slug: row.slug,
          nom: row.nom,
          type_zone: row.type_zone,
          source: row.source,
          version_source: row.version_source,
          maj: row.maj,
        },
      })),
    };
  });
}
