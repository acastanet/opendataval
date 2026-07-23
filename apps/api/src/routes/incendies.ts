import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { deserialize } from "flatgeobuf/lib/mjs/geojson.js";
import { cleDate, dateParis, evaluerFraicheurFirms, parseHours } from "../lib/incendies.js";

const MASSIFS_GARD_FGB_URL = "https://www.risque-prevention-incendie.fr/static/30/massifs_30.fgb";
const IDS_MASSIFS_AIGOUAL = new Set([301, 302, 303]);
const NOMS_MASSIFS_AIGOUAL = new Set(["CAUSSE AIGOUAL", "SUD CEVENNES", "NORD CEVENNES"]);
const NOMS_MASSIFS_GARD = new Set([
  "CAUSSE AIGOUAL", "SUD CEVENNES", "NORD CEVENNES", "GARDON VIDOURLE",
  "VAL DE CEZE", "GARRIGUES", "COSTIERES PETITE CAMARGUE", "GARD RHODANIEN",
]);
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
    features.push(feature as MassifGardFeature);
  }
  const idsRecus = new Set(features.map((feature) => Number(feature.properties?.ID)));
  if (![...IDS_MASSIFS_AIGOUAL].every((id) => idsRecus.has(id))) {
    throw new Error("Massifs officiels du Gard : contours de l'Aigoual manquants");
  }

  cacheMassifsGard = { expireA: Date.now() + CACHE_MASSIFS_MS, features };
  return features;
}

interface DetectionQuery {
  hours?: string;
  perimetre?: string;
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
  position: "coeur" | "proche" | "veille" | "departement";
  distance_coeur_m: string;
  collectee_a: string;
  geometry: PointGeometry;
}

interface ZoneRow {
  slug: string;
  nom: string;
  type_zone: "coeur" | "proche_5km" | "veille_15km" | "departement" | "officielle";
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
  mode_collecte: "automatique" | "manuel";
}

interface FetchLogRow {
  statut: "en_cours" | "ok" | "partiel" | "erreur";
  demarre_a: string;
  termine_a: string | null;
  erreur: string | null;
}

function collecteLaPlusRecente(rows: RiskRow[]): string | null {
  const valeurs = rows.map((row) => new Date(row.collectee_a).getTime()).filter(Number.isFinite);
  return valeurs.length === 0 ? null : new Date(Math.max(...valeurs)).toISOString();
}

function resumeRisque(rows: RiskRow[], dateDemandee: string, repli: RiskRow[] = [], massifsAttendus: Set<string> = NOMS_MASSIFS_AIGOUAL) {
  const ordre = ["inconnu", "blanc", "jaune", "orange", "rouge"];
  const lignesCompletes = (lignes: RiskRow[]) => (
    lignes.length === massifsAttendus.size && lignes.every((ligne) => massifsAttendus.has(ligne.zone_officielle))
  );
  const lignesDemandee = lignesCompletes(rows) ? rows : [];
  const zonesRepli = lignesCompletes(repli) ? repli : [];
  const zones = lignesDemandee.length > 0 ? lignesDemandee : zonesRepli;
  const niveauMax = zones.reduce((maximum, risque) => (
    ordre.indexOf(risque.niveau) > ordre.indexOf(maximum) ? risque.niveau : maximum
  ), "inconnu");

  if (zones.length === 0) {
    return {
      etat: "indisponible" as const,
      date_demandee: dateDemandee,
      date_validite: dateDemandee,
      niveau_max: "inconnu",
      derniere_collecte: null,
      zones: [],
    };
  }
  const ancienne = lignesDemandee.length === 0;
  return {
    etat: ancienne ? "ancienne" as const : "ok" as const,
    date_demandee: dateDemandee,
    date_validite: cleDate(zones[0]!.date_validite),
    niveau_max: niveauMax,
    derniere_collecte: collecteLaPlusRecente(zones),
    mode_collecte: zones.some((zone) => zone.mode_collecte === "manuel") ? "manuel" as const : "automatique" as const,
    zones,
  };
}

interface PerimetreQuery {
  perimetre?: string;
}

export function registerIncendiesRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Querystring: PerimetreQuery }>("/api/incendies/massifs-officiels", async (request, reply) => {
    try {
      const departement = request.query.perimetre === "departement";
      const features = await chargerMassifsGardOfficiels();
      reply.header("cache-control", "public, max-age=21600");
      return {
        type: "FeatureCollection",
        source: MASSIFS_GARD_FGB_URL,
        features: departement ? features : features.filter((feature) => IDS_MASSIFS_AIGOUAL.has(Number(feature.properties?.ID))),
      };
    } catch (error) {
      app.log.error(error, "Chargement des contours officiels des massifs gardois impossible");
      reply.code(502);
      return { error: "Les contours officiels des massifs gardois sont temporairement indisponibles." };
    }
  });

  app.get<{ Querystring: PerimetreQuery }>("/api/incendies/situation", async (request, reply) => {
    const massifsAttendus = request.query.perimetre === "departement" ? NOMS_MASSIFS_GARD : NOMS_MASSIFS_AIGOUAL;
    const [{ rows: counts }, { rows: firmsLogs }, { rows: gardLogs }, { rows: risks }, { rows: zones }] = await Promise.all([
      pool.query<{ position: string; nombre: number }>(
        `select detection.position, count(*)::int as nombre
           from incendies.detections_firms as detection
           join incendies.zones as veille
             on veille.slug = 'veille_15km' and ST_Covers(veille.geom, detection.geom)
          where detection.observee_a >= now() - interval '24 hours'
          group by detection.position`,
      ),
      pool.query<FetchLogRow>(
        `select statut, demarre_a, termine_a, erreur
           from meta.fetch_log where source = 'firms'
          order by demarre_a desc limit 20`,
      ),
      pool.query<FetchLogRow>(
        `select statut, demarre_a, termine_a, erreur
           from meta.fetch_log where source = 'fire_risk_gard'
          order by demarre_a desc limit 20`,
      ),
      pool.query<RiskRow>(
        `select date_validite, collectee_a, zone_officielle, niveau, restrictions, source_url, mode_collecte
           from incendies.risques_officiels
          where departement = 'Gard'
            and date_validite in (
              (now() at time zone 'Europe/Paris')::date,
              ((now() at time zone 'Europe/Paris')::date + 1),
              (select max(date_validite) from incendies.risques_officiels
                where departement = 'Gard'
                  and date_validite < (now() at time zone 'Europe/Paris')::date)
            )
          order by date_validite desc, zone_officielle`,
      ),
      pool.query<{ nombre: number }>("select count(*)::int as nombre from incendies.zones where slug in ('coeur', 'proche_5km', 'veille_15km')"),
    ]);

    const byPosition = Object.fromEntries(counts.map((count) => [count.position, count.nombre]));
    const latestFirms = firmsLogs[0] ?? null;
    const latestFirmsSuccess = firmsLogs.find((log) => log.statut === "ok" || log.statut === "partiel") ?? null;
    const latestGard = gardLogs[0] ?? null;
    const latestGardSuccess = gardLogs.find((log) => log.statut === "ok" || log.statut === "partiel") ?? null;
    const aujourdhui = dateParis();
    const demain = dateParis(1);
    const risquesAujourdhui = risks.filter((risque) => cleDate(risque.date_validite) === aujourdhui);
    const risquesDemain = risks.filter((risque) => cleDate(risque.date_validite) === demain);
    const dateRepli = risks.map((risque) => cleDate(risque.date_validite)).find((date) => date < aujourdhui);
    const risquesRepli = dateRepli ? risks.filter((risque) => cleDate(risque.date_validite) === dateRepli) : [];
    const fraicheurFirms = evaluerFraicheurFirms(latestFirmsSuccess?.termine_a ?? null);
    reply.header("cache-control", "public, max-age=60");
    return {
      detections_24h: {
        coeur: byPosition.coeur ?? 0,
        proche: byPosition.proche ?? 0,
        veille: byPosition.veille ?? 0,
      },
      firms: latestFirms === null
        ? { etat: "non_collecte", fraicheur: "indisponible", age_minutes: null, derniere_collecte: null, derniere_tentative: null }
        : {
            etat: latestFirms.statut,
            fraicheur: fraicheurFirms.etat,
            age_minutes: fraicheurFirms.age_minutes,
            derniere_collecte: latestFirmsSuccess?.termine_a ?? null,
            derniere_tentative: latestFirms.termine_a ?? latestFirms.demarre_a,
            message: latestFirms.statut === "erreur"
              ? "La dernière tentative FIRMS a échoué ; la dernière collecte valide reste affichée."
              : latestFirms.statut === "partiel"
                ? `La dernière collecte FIRMS est partielle${latestFirms.erreur ? ` (${latestFirms.erreur})` : ""}.`
                : undefined,
          },
      risque_gard: {
        aujourd_hui: resumeRisque(risquesAujourdhui, aujourdhui, risquesRepli, massifsAttendus),
        demain: resumeRisque(risquesDemain, demain, [], massifsAttendus),
        source: {
          etat: latestGard?.statut ?? "non_collecte",
          derniere_tentative: latestGard?.termine_a ?? latestGard?.demarre_a ?? null,
          derniere_reussite: latestGardSuccess?.termine_a ?? null,
          message: latestGard?.statut === "erreur"
            ? "La dernière tentative de collecte Gard a échoué ; la dernière publication valide reste affichée."
            : latestGard?.statut === "partiel"
              ? `La collecte Gard est partielle${latestGard.erreur ? ` (${latestGard.erreur})` : ""}.`
              : undefined,
        },
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
    const departement = request.query.perimetre === "departement";

    const { rows } = await pool.query<DetectionRow>(
      departement
        ? `select detection.external_id, detection.observee_a, detection.satellite, detection.instrument,
                  detection.confiance, detection.frp::text, detection.jour_nuit, detection.position,
                  round(detection.distance_coeur_m)::text as distance_coeur_m, detection.collectee_a,
                  ST_AsGeoJSON(detection.geom, 6)::json as geometry
             from incendies.detections_firms as detection
            where detection.observee_a >= now() - ($1::text || ' hours')::interval
            order by detection.observee_a desc`
        : `select detection.external_id, detection.observee_a, detection.satellite, detection.instrument,
                  detection.confiance, detection.frp::text, detection.jour_nuit, detection.position,
                  round(detection.distance_coeur_m)::text as distance_coeur_m, detection.collectee_a,
                  ST_AsGeoJSON(detection.geom, 6)::json as geometry
             from incendies.detections_firms as detection
             join incendies.zones as veille
               on veille.slug = 'veille_15km' and ST_Covers(veille.geom, detection.geom)
            where detection.observee_a >= now() - ($1::text || ' hours')::interval
            order by detection.observee_a desc`,
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
          collectee_a: row.collectee_a,
          source_url: "https://firms.modaps.eosdis.nasa.gov/",
        },
      })),
    };
  });

  app.get("/api/incendies/detections/dernieres", async (_request, reply) => {
    const { rows } = await pool.query<DetectionRow>(
      `select detection.external_id, detection.observee_a, detection.satellite, detection.instrument,
              detection.confiance, detection.frp::text, detection.jour_nuit, detection.position,
              round(detection.distance_coeur_m)::text as distance_coeur_m, detection.collectee_a,
              ST_AsGeoJSON(detection.geom, 6)::json as geometry
         from incendies.detections_firms as detection
         join incendies.zones as veille
           on veille.slug = 'veille_15km' and ST_Covers(veille.geom, detection.geom)
        order by detection.observee_a desc
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
          collectee_a: row.collectee_a,
          source_url: "https://firms.modaps.eosdis.nasa.gov/",
        },
      })),
    };
  });

  app.get("/api/incendies/zones", async (_request, reply) => {
    const { rows } = await pool.query<ZoneRow>(
      `select slug, nom, type_zone, source, version_source, maj,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.00005), 6)::json as geometry
         from incendies.zones
        where type_zone in ('coeur', 'proche_5km', 'veille_15km', 'departement')
        order by case type_zone when 'departement' then 0 when 'veille_15km' then 1 when 'proche_5km' then 2 else 3 end`,
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
