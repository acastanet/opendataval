import type pg from "pg";
import { logFetchEnd, logFetchStart } from "@opendata-vda/shared";
import * as geoapi from "./sources/geoapi.js";
import * as georisques from "./sources/georisques.js";
import * as hubeau from "./sources/hubeau.js";
import * as apicarto from "./sources/apicarto.js";
import * as education from "./sources/education.js";
import * as lannuaire from "./sources/lannuaire.js";
import * as osm from "./sources/osm.js";
import * as adresses from "./sources/adresses.js";
import * as entreprises from "./sources/entreprises.js";
import * as rpg from "./sources/rpg.js";
import * as signesQualite from "./sources/signesQualite.js";
import * as metaSources from "./sources/metaSources.js";
import * as inseePopulation from "./sources/insee_population.js";
import * as meteoObs from "./sources/meteo_obs.js";
import * as meteoRadome from "./sources/meteo_radome.js";
import * as meteoInfoclimat from "./sources/meteo_infoclimat.js";
import * as meteoPurge from "./sources/meteo_purge.js";
import * as meteoClimat from "./sources/meteo_climat.js";
import * as firms from "./sources/firms.js";
import * as fireZones from "./sources/fireZones.js";
import * as fireRiskGard from "./sources/fireRiskGard.js";

export interface SourceJob {
  slug: string;
  /** Expression cron (heure Europe/Paris implicite du conteneur). */
  cron: string;
  run: (pool: pg.Pool) => Promise<number>;
  /** Prédicat optionnel : si faux au démarrage, le job est ignoré (ex. clé API absente). */
  actif?: () => boolean;
}

export const JOBS: SourceJob[] = [
  { slug: "meta_sources", cron: "0 2 1 * *", run: metaSources.run }, // mensuel (premier du mois)
  { slug: "geoapi", cron: "0 3 1 * *", run: geoapi.run }, // mensuel
  { slug: "fire_zones", cron: "10 3 1 * *", run: fireZones.run }, // mensuel, après geoapi
  { slug: "fire_risk_gard", cron: "10 18 * * *", run: fireRiskGard.run }, // publication annoncée vers 18 h
  { slug: "georisques", cron: "0 3 2 * *", run: georisques.run }, // mensuel
  { slug: "apicarto", cron: "0 3 1 */3 *", run: apicarto.run }, // trimestriel
  { slug: "education", cron: "0 3 3 * *", run: education.run }, // mensuel
  { slug: "lannuaire", cron: "0 3 4 * *", run: lannuaire.run }, // mensuel
  { slug: "osm", cron: "0 3 * * 1", run: osm.run }, // hebdomadaire
  { slug: "hubeau", cron: "0 5 * * *", run: hubeau.run }, // quotidien
  { slug: "adresses", cron: "0 4 5 * *", run: adresses.run }, // mensuel
  { slug: "entreprises", cron: "0 4 6 * *", run: entreprises.run }, // mensuel
  { slug: "rpg", cron: "0 4 15 1 *", run: rpg.run }, // annuel (15 janvier)
  { slug: "signes_qualite", cron: "0 4 20 1 *", run: signesQualite.run }, // annuel (20 janvier)
  {
    slug: "insee_population",
    cron: "0 5 25 1 *", // annuel (25 janvier, après publication des populations légales)
    run: inseePopulation.run,
    actif: () => Boolean(process.env.INSEE_POPULATION_CSV_URL),
  },
  {
    slug: "meteo_obs",
    cron: "20 * * * *", // horaire (hh:20, après publication DPObs vers hh+5/+15)
    run: meteoObs.run,
    actif: () => Boolean(process.env.METEOFRANCE_API_TOKEN),
  },
  {
    slug: "meteo_radome",
    cron: "*/6 * * * *", // toutes les 6 minutes, stations RADOME
    run: meteoRadome.run,
    actif: () => Boolean(process.env.METEOFRANCE_API_TOKEN),
  },
  {
    slug: "meteo_infoclimat",
    cron: "10 * * * *", // horaire (hh:10)
    run: meteoInfoclimat.run,
    actif: () => Boolean(process.env.INFOCLIMAT_API_TOKEN),
  },
  { slug: "meteo_purge", cron: "40 4 * * *", run: meteoPurge.run }, // quotidien
  { slug: "meteo_climat", cron: "0 6 8 * *", run: meteoClimat.run }, // mensuel (le 8)
  {
    slug: "firms",
    cron: "*/30 * * * *",
    run: firms.run,
    actif: () => Boolean(process.env.NASA_FIRMS_MAP_KEY),
  },
];

export async function runJob(pool: pg.Pool, job: SourceJob): Promise<void> {
  if (job.actif && !job.actif()) {
    console.warn(`[${job.slug}] ignoré — condition d'activation non remplie (clé API absente ?)`);
    return;
  }
  const logId = await logFetchStart(pool, job.slug);
  try {
    const nbLignes = await job.run(pool);
    await logFetchEnd(pool, logId, "ok", nbLignes);
    console.log(`[${job.slug}] ok — ${nbLignes} lignes`);
  } catch (err) {
    await logFetchEnd(pool, logId, "erreur", undefined, (err as Error).message);
    console.error(`[${job.slug}] erreur —`, err);
  }
}

export async function runAllOnce(pool: pg.Pool, jobs: SourceJob[] = JOBS): Promise<void> {
  for (const job of jobs) {
    await runJob(pool, job);
  }
}
