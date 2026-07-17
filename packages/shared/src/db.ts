import pg from "pg";

const { Pool } = pg;
export type { Pool as PgPool } from "pg";

export function createPool(): pg.Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "db",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "opendata",
    password: process.env.POSTGRES_PASSWORD ?? "changeme",
    database: process.env.POSTGRES_DB ?? "opendata_vda",
  });
}

export interface CommuneInput {
  codeInsee: string;
  nom: string;
  codeEpci?: string | null;
  population?: number | null;
  surfaceHa?: number | null;
  estEpciMembre: boolean;
  geometry: unknown;
}

export async function upsertCommune(pool: pg.Pool, c: CommuneInput): Promise<void> {
  await pool.query(
    `insert into territoire.communes
       (code_insee, nom, code_epci, population, surface_ha, est_epci_membre, geom, maj)
     values ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($7)), 4326), now())
     on conflict (code_insee) do update set
       nom = excluded.nom,
       code_epci = excluded.code_epci,
       population = excluded.population,
       surface_ha = excluded.surface_ha,
       est_epci_membre = excluded.est_epci_membre or territoire.communes.est_epci_membre,
       geom = excluded.geom,
       maj = now()`,
    [
      c.codeInsee,
      c.nom,
      c.codeEpci ?? null,
      c.population ?? null,
      c.surfaceHa ?? null,
      c.estEpciMembre,
      JSON.stringify(c.geometry),
    ],
  );
}

export interface ObjetInput {
  couche: string;
  externalId: string;
  props: unknown;
  geometry: unknown;
  sourceUrl?: string | null;
}

export async function upsertObjet(pool: pg.Pool, o: ObjetInput): Promise<void> {
  await pool.query(
    `insert into couches.objets (couche, external_id, props, geom, source_url, maj)
     values ($1, $2, $3::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, now())
     on conflict (couche, external_id) do update set
       props = excluded.props,
       geom = excluded.geom,
       source_url = excluded.source_url,
       maj = now()`,
    [o.couche, o.externalId, JSON.stringify(o.props), JSON.stringify(o.geometry), o.sourceUrl ?? null],
  );
}

export async function upsertObjetsEnLot(pool: pg.Pool, objets: ObjetInput[]): Promise<void> {
  if (objets.length === 0) return;
  await pool.query(
    `insert into couches.objets (couche, external_id, props, geom, source_url, maj)
     select c, eid, p::jsonb, ST_SetSRID(ST_GeomFromGeoJSON(g), 4326), s, now()
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) as t(c, eid, p, g, s)
     on conflict (couche, external_id) do update set
       props = excluded.props,
       geom = excluded.geom,
       source_url = excluded.source_url,
       maj = now()`,
    [
      objets.map((o) => o.couche),
      objets.map((o) => o.externalId),
      objets.map((o) => JSON.stringify(o.props)),
      objets.map((o) => JSON.stringify(o.geometry)),
      objets.map((o) => o.sourceUrl ?? null),
    ],
  );
}

export interface IndicateurInput {
  indicateur: string;
  territoire: string;
  periode: string;
  valeur: number | null;
  source: string;
}

/** Upsert par lots des points d'indicateurs (unnest), calqué sur upsertObjetsEnLot. */
export async function upsertIndicateurs(pool: pg.Pool, lignes: IndicateurInput[]): Promise<void> {
  if (lignes.length === 0) return;
  await pool.query(
    `insert into series.indicateurs (indicateur, territoire, periode, valeur, source, maj)
     select i, t, p, v, s, now()
     from unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::text[]) as u(i, t, p, v, s)
     on conflict (indicateur, territoire, periode) do update set
       valeur = excluded.valeur,
       source = excluded.source,
       maj = now()`,
    [
      lignes.map((l) => l.indicateur),
      lignes.map((l) => l.territoire),
      lignes.map((l) => l.periode),
      lignes.map((l) => l.valeur),
      lignes.map((l) => l.source),
    ],
  );
}

export async function upsertPiezoMesures(
  pool: pg.Pool,
  codeBss: string,
  mesures: Array<{ date: string; niveauMNgf: number | null; profondeurM: number | null }>,
): Promise<void> {
  if (mesures.length === 0) return;
  const dates = mesures.map((m) => m.date);
  const niveaux = mesures.map((m) => m.niveauMNgf);
  const profondeurs = mesures.map((m) => m.profondeurM);
  await pool.query(
    `insert into series.piezo (code_bss, date, niveau_m_ngf, profondeur_m)
     select $1, d, n, p
     from unnest($2::date[], $3::numeric[], $4::numeric[]) as t(d, n, p)
     on conflict (code_bss, date) do update set
       niveau_m_ngf = excluded.niveau_m_ngf,
       profondeur_m = excluded.profondeur_m`,
    [codeBss, dates, niveaux, profondeurs],
  );
}

export interface MeteoQuotidienInput {
  date: string;
  rr: number | null;
  tn: number | null;
  tx: number | null;
  tm: number | null;
}

export async function upsertMeteoQuotidien(
  pool: pg.Pool,
  numPoste: string,
  lignes: MeteoQuotidienInput[],
): Promise<void> {
  if (lignes.length === 0) return;
  await pool.query(
    `insert into series.meteo_quotidien (num_poste, date, rr, tn, tx, tm)
     select $1, d, rr, tn, tx, tm
     from unnest($2::date[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[])
       as t(d, rr, tn, tx, tm)
     on conflict (num_poste, date) do update set
       rr = excluded.rr, tn = excluded.tn, tx = excluded.tx, tm = excluded.tm`,
    [
      numPoste,
      lignes.map((l) => l.date),
      lignes.map((l) => l.rr),
      lignes.map((l) => l.tn),
      lignes.map((l) => l.tx),
      lignes.map((l) => l.tm),
    ],
  );
}

export interface MeteoHoraireInput {
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

export async function upsertMeteoHoraire(
  pool: pg.Pool,
  numPoste: string,
  obs: MeteoHoraireInput[],
): Promise<void> {
  if (obs.length === 0) return;
  await pool.query(
    `insert into series.meteo_horaire
       (num_poste, heure_utc, t, humidite, vent_dir, vent_kmh, rafale_kmh, pluie_1h_mm, pression_hpa, neige_cm)
     select $1, h, t, hu, vd, vk, rk, p1, ph, nc
     from unnest(
       $2::timestamptz[], $3::numeric[], $4::smallint[], $5::smallint[],
       $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[]
     ) as t(h, t, hu, vd, vk, rk, p1, ph, nc)
     on conflict (num_poste, heure_utc) do update set
       t = excluded.t, humidite = excluded.humidite, vent_dir = excluded.vent_dir,
       vent_kmh = excluded.vent_kmh, rafale_kmh = excluded.rafale_kmh,
       pluie_1h_mm = excluded.pluie_1h_mm, pression_hpa = excluded.pression_hpa,
       neige_cm = excluded.neige_cm`,
    [
      numPoste,
      obs.map((o) => o.heureUtc),
      obs.map((o) => o.t),
      obs.map((o) => o.humidite),
      obs.map((o) => o.ventDir),
      obs.map((o) => o.ventKmh),
      obs.map((o) => o.rafaleKmh),
      obs.map((o) => o.pluie1hMm),
      obs.map((o) => o.pressionHpa),
      obs.map((o) => o.neigeCm),
    ],
  );
}

export async function logFetchStart(pool: pg.Pool, source: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `insert into meta.fetch_log (source) values ($1) returning id`,
    [source],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("logFetchStart: insertion sans id retourné");
  return id;
}

export async function logFetchEnd(
  pool: pg.Pool,
  id: number,
  statut: "ok" | "erreur",
  nbLignes?: number,
  erreur?: string,
): Promise<void> {
  await pool.query(
    `update meta.fetch_log
     set termine_a = now(), statut = $2, nb_lignes = $3, erreur = $4
     where id = $1`,
    [id, statut, nbLignes ?? null, erreur ?? null],
  );
}

export async function upsertSource(pool: pg.Pool, s: { slug: string; nom: string; url: string; licence: string; frequence: string }): Promise<void> {
  await pool.query(
    `insert into meta.sources (slug, nom, url, licence, frequence)
     values ($1, $2, $3, $4, $5)
     on conflict (slug) do update set
       nom = excluded.nom,
       url = excluded.url,
       licence = excluded.licence,
       frequence = excluded.frequence`,
    [s.slug, s.nom, s.url, s.licence, s.frequence],
  );
}
