import type pg from "pg";
import { upsertObjetsEnLot, type MeteoHoraireInput, type StationMeteo } from "@opendata-vda/shared";

/** Observation horaire brute renvoyée par DPObs v2 (station/horaire ou station/infrahoraire-6m). */
export interface ObservationDPObs {
  validity_time: string;
  t: number | null; // Kelvin
  u: number | null; // humidité %
  dd: number | null; // direction vent moyen (°)
  ff: number | null; // vitesse vent moyen (m/s)
  raf: number | null; // vitesse de la rafale (m/s)
  rr1: number | null; // précipitations 1h (mm)
  pres: number | null; // pression station (Pa)
  pmer: number | null; // pression mer (Pa), souvent absente en altitude
  sss: number | null; // hauteur de neige (m)
}

export const kelvinVersCelsius = (k: number | null): number | null =>
  k == null ? null : Math.round((k - 273.15) * 10) / 10;
export const msVersKmh = (v: number | null): number | null => (v == null ? null : Math.round(v * 3.6 * 10) / 10);
export const paVersHpa = (v: number | null): number | null => (v == null ? null : Math.round((v / 100) * 10) / 10);
export const mVersCm = (v: number | null): number | null => (v == null ? null : Math.round(v * 100 * 10) / 10);

export function versMeteoHoraire(obs: ObservationDPObs): MeteoHoraireInput {
  return {
    heureUtc: obs.validity_time,
    t: kelvinVersCelsius(obs.t),
    humidite: obs.u,
    ventDir: obs.dd,
    ventKmh: msVersKmh(obs.ff),
    rafaleKmh: msVersKmh(obs.raf),
    pluie1hMm: obs.rr1,
    pressionHpa: paVersHpa(obs.pmer ?? obs.pres),
    neigeCm: mVersCm(obs.sss),
  };
}

/** Upsert des objets couche "station_meteo" (une ligne par station, indépendamment des observations). */
export async function upsertStationsObjets(pool: pg.Pool, stations: readonly StationMeteo[]): Promise<void> {
  if (stations.length === 0) return;
  await upsertObjetsEnLot(
    pool,
    stations.map((s) => ({
      couche: "station_meteo",
      externalId: s.id,
      props: {
        nom: s.nom,
        altitude_m: s.altitudeM,
        reseau: s.reseau,
        pack: s.pack ?? null,
        licence: s.licence,
        type: s.reseau === "meteofrance" ? "Station Météo-France" : "Station amateur (Infoclimat)",
      },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      sourceUrl:
        s.reseau === "meteofrance" ? "https://portail-api.meteofrance.fr" : "https://www.infoclimat.fr/opendata/",
    })),
  );
}

export const ENTETES_MF = (token: string): Record<string, string> => ({
  apikey: token,
  "User-Agent": "opendata-vda-worker/1.0",
});
