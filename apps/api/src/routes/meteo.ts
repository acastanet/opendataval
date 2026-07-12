import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { STATIONS_METEO, STATIONS_PAR_ID, TERRITOIRE } from "@opendata-vda/shared";

const NUM_POSTE = TERRITOIRE.stationMeteo.numPoste;

const URL_PREVISIONS =
  "https://api.open-meteo.com/v1/meteofrance" +
  `?latitude=${TERRITOIRE.montAigoual.lat}&longitude=${TERRITOIRE.montAigoual.lon}` +
  `&elevation=${TERRITOIRE.stationMeteo.altitudeM}&timezone=Europe%2FParis&forecast_days=7` +
  "&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,weather_code" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max";

const TTL_PREVISIONS_MS = 30 * 60 * 1000;
let cachePrevisions: { expiresAt: number; data: unknown } | null = null;

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
