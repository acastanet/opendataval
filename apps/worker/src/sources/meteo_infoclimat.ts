import type pg from "pg";
import { stationsInfoclimat, upsertMeteoHoraire, type MeteoHoraireInput } from "@opendata-vda/shared";
import { upsertStationsObjets } from "./meteo_commun.js";

const URL_OPENDATA = "https://www.infoclimat.fr/opendata/";

/**
 * Enregistrement horaire brut Infoclimat. Le schéma exact (clé "hourly" par station, champs en
 * chaînes) n'est documentable qu'avec un compte actif — à reconfirmer au premier appel réel en
 * production ; le parsing ci-dessous est volontairement tolérant (plusieurs noms de champs essayés).
 */
interface RelevéInfoclimat {
  dh_utc?: string;
  temperature?: string | number | null;
  humidite?: string | number | null;
  pression?: string | number | null;
  vent_moyen?: string | number | null;
  vent_rafales?: string | number | null;
  vent_direction?: string | number | null;
  pluie_1h?: string | number | null;
  pluie_3h?: string | number | null;
}

interface ReponseOpendata {
  hourly?: Record<string, Record<string, RelevéInfoclimat> | RelevéInfoclimat[]>;
}

const nombre = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const versIso = (dhUtc: string): string => (dhUtc.includes("T") ? dhUtc : `${dhUtc.replace(" ", "T")}Z`);

function versMeteoHoraire(dh: string, r: RelevéInfoclimat): MeteoHoraireInput {
  return {
    heureUtc: versIso(r.dh_utc ?? dh),
    t: nombre(r.temperature),
    humidite: nombre(r.humidite),
    ventDir: nombre(r.vent_direction),
    ventKmh: nombre(r.vent_moyen),
    rafaleKmh: nombre(r.vent_rafales),
    pluie1hMm: nombre(r.pluie_1h) ?? null,
    pressionHpa: nombre(r.pression),
    neigeCm: null,
  };
}

/** Observations horaires des stations amateurs Infoclimat (réseau StatIC) sur le territoire. */
export async function run(pool: pg.Pool): Promise<number> {
  const token = process.env.INFOCLIMAT_API_TOKEN;
  if (!token) throw new Error("meteo_infoclimat : INFOCLIMAT_API_TOKEN absent");

  const stations = stationsInfoclimat();
  await upsertStationsObjets(pool, stations);

  const fin = new Date();
  const debut = new Date(fin.getTime() - 2 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date): string => d.toISOString().slice(0, 10);

  const params = new URLSearchParams({ method: "get", format: "json", start: fmt(debut), end: fmt(fin), token });
  for (const s of stations) params.append("stations[]", s.id);

  const res = await fetch(`${URL_OPENDATA}?${params.toString()}`, {
    headers: { "User-Agent": "opendata-vda-worker/1.0" },
  });
  if (!res.ok) throw new Error(`meteo_infoclimat -> HTTP ${res.status}`);
  const data = (await res.json()) as ReponseOpendata;

  let nbLignes = 0;
  for (const station of stations) {
    const brut = data.hourly?.[station.id];
    if (!brut) continue;

    const releves: MeteoHoraireInput[] = Array.isArray(brut)
      ? brut.filter((r) => r.dh_utc).map((r) => versMeteoHoraire(r.dh_utc!, r))
      : Object.entries(brut).map(([dh, r]) => versMeteoHoraire(dh, r));

    if (releves.length === 0) continue;
    await upsertMeteoHoraire(pool, station.id, releves);
    nbLignes += releves.length;
  }

  return nbLignes;
}
