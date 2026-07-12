import type pg from "pg";
import { stationsRadome, upsertMeteoHoraire } from "@opendata-vda/shared";
import { ENTETES_MF, kelvinVersCelsius, msVersKmh, paVersHpa, mVersCm, type ObservationDPObs } from "./meteo_commun.js";

const URL_DPOBS_6MIN = "https://public-api.meteofrance.fr/public/DPObs/v2/station/infrahoraire-6m";
const PAUSE_ENTRE_APPELS_MS = 150;

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Observations infra-horaires (6 min) des stations RADOME du territoire. Complète meteo_obs (horaire) :
 * les obs tombant pile à la minute 0 sont ignorées ici pour ne pas écraser la ligne horaire complète
 * (rr1 sur 1 h) avec une pluie sur 6 min seulement (pluie_1h_mm laissé à null dans ce cas).
 */
export async function run(pool: pg.Pool): Promise<number> {
  const token = process.env.METEOFRANCE_API_TOKEN;
  if (!token) throw new Error("meteo_radome : METEOFRANCE_API_TOKEN absent");

  const stations = stationsRadome();
  let nbLignes = 0;
  let nbErreurs = 0;

  for (const station of stations) {
    try {
      const res = await fetch(`${URL_DPOBS_6MIN}?id_station=${station.id}&format=json`, {
        headers: ENTETES_MF(token),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const observations = (await res.json()) as ObservationDPObs[];
      const derniere = observations[0];
      if (derniere && new Date(derniere.validity_time).getUTCMinutes() !== 0) {
        await upsertMeteoHoraire(pool, station.id, [
          {
            heureUtc: derniere.validity_time,
            t: kelvinVersCelsius(derniere.t),
            humidite: derniere.u,
            ventDir: derniere.dd,
            ventKmh: msVersKmh(derniere.ff),
            rafaleKmh: msVersKmh(derniere.raf),
            pluie1hMm: null,
            pressionHpa: paVersHpa(derniere.pmer ?? derniere.pres),
            neigeCm: mVersCm(derniere.sss),
          },
        ]);
        nbLignes++;
      }
    } catch (err) {
      nbErreurs++;
      console.warn(`meteo_radome : station ${station.id} (${station.nom}) —`, (err as Error).message);
    }
    await attendre(PAUSE_ENTRE_APPELS_MS);
  }

  if (nbErreurs === stations.length) {
    throw new Error(`meteo_radome : échec sur les ${stations.length} stations`);
  }

  return nbLignes;
}
