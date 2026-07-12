import type pg from "pg";
import { stationsMeteoFrance, upsertMeteoHoraire } from "@opendata-vda/shared";
import { ENTETES_MF, upsertStationsObjets, versMeteoHoraire, type ObservationDPObs } from "./meteo_commun.js";

const URL_DPOBS_HORAIRE = "https://public-api.meteofrance.fr/public/DPObs/v2/station/horaire";
const PAUSE_ENTRE_APPELS_MS = 150;

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Observations horaires du réseau de stations Météo-France du territoire (API DPObs v2). */
export async function run(pool: pg.Pool): Promise<number> {
  const token = process.env.METEOFRANCE_API_TOKEN;
  if (!token) throw new Error("meteo_obs : METEOFRANCE_API_TOKEN absent");

  const stations = stationsMeteoFrance();
  await upsertStationsObjets(pool, stations);

  let nbLignes = 0;
  let nbErreurs = 0;

  for (const station of stations) {
    try {
      const res = await fetch(`${URL_DPOBS_HORAIRE}?id_station=${station.id}&format=json`, {
        headers: ENTETES_MF(token),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const observations = (await res.json()) as ObservationDPObs[];
      if (observations.length > 0) {
        await upsertMeteoHoraire(pool, station.id, observations.map(versMeteoHoraire));
        nbLignes += observations.length;
      }
    } catch (err) {
      nbErreurs++;
      console.warn(`meteo_obs : station ${station.id} (${station.nom}) —`, (err as Error).message);
    }
    await attendre(PAUSE_ENTRE_APPELS_MS);
  }

  if (nbErreurs === stations.length) {
    throw new Error(`meteo_obs : échec sur les ${stations.length} stations`);
  }

  return nbLignes;
}
