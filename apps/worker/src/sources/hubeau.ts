import type pg from "pg";
import { TERRITOIRE, corrigerCoordonnees, upsertObjet, upsertPiezoMesures } from "@opendata-vda/shared";

interface HubeauPage<T> {
  count: number;
  next: string | null;
  data: T[];
}

interface StationPiezo {
  code_bss: string;
  bss_id: string;
  nom_commune: string;
  x: number;
  y: number;
  altitude_station: string | null;
  nb_mesures_piezo: number | null;
  libelle_pe: string | null;
  date_debut_mesure: string | null;
  date_fin_mesure: string | null;
}

interface MesurePiezo {
  date_mesure: string;
  niveau_nappe_eau: number | null;
  profondeur_nappe: number | null;
}

interface StationHydro {
  code_station: string;
  libelle_station: string;
  longitude_station: number | null;
  latitude_station: number | null;
  libelle_cours_eau: string | null;
  en_service: boolean;
}

async function fetchAll<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { headers: { "User-Agent": "opendata-vda-worker/1.0" } });
    if (!res.ok) throw new Error(`Hub'Eau ${next} -> HTTP ${res.status}`);
    const page = (await res.json()) as HubeauPage<T>;
    results.push(...page.data);
    next = page.next;
  }
  return results;
}

/** Piézométrie (nappes) + hydrométrie (débits) sur la commune, via Hub'Eau. */
export async function run(pool: pg.Pool): Promise<number> {
  let n = 0;
  const codeInsee = TERRITOIRE.commune.codeInsee;

  const stationsPiezo = await fetchAll<StationPiezo>(
    `https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/stations?code_commune=${codeInsee}&format=json&size=20`,
  );
  for (const s of stationsPiezo) {
    const coords = corrigerCoordonnees(s.x, s.y, TERRITOIRE.bbox);
    if (!coords) {
      console.warn(`[hubeau] station piézo ${s.code_bss} ignorée — coordonnées hors zone (${s.x}, ${s.y})`);
      continue;
    }
    await upsertObjet(pool, {
      couche: "piezo",
      externalId: s.code_bss,
      props: {
        nom: s.libelle_pe ?? s.nom_commune,
        altitude_m: s.altitude_station,
        nb_mesures: s.nb_mesures_piezo,
        date_debut: s.date_debut_mesure,
        date_fin: s.date_fin_mesure,
      },
      geometry: { type: "Point", coordinates: coords },
      sourceUrl: "https://ades.eaufrance.fr/",
    });
    n++;

    const mesures = await fetchAll<MesurePiezo>(
      `https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/chroniques` +
        `?code_bss=${encodeURIComponent(s.code_bss)}&format=json&size=5000`,
    );
    await upsertPiezoMesures(
      pool,
      s.code_bss,
      mesures.map((m) => ({
        date: m.date_mesure,
        niveauMNgf: m.niveau_nappe_eau,
        profondeurM: m.profondeur_nappe,
      })),
    );
  }

  const stationsHydro = await fetchAll<StationHydro>(
    `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations` +
      `?code_commune_station=${codeInsee}&format=json&size=20`,
  );
  for (const s of stationsHydro) {
    if (s.longitude_station == null || s.latitude_station == null) continue;
    const coords = corrigerCoordonnees(s.longitude_station, s.latitude_station, TERRITOIRE.bbox);
    if (!coords) {
      console.warn(
        `[hubeau] station hydro ${s.code_station} ignorée — coordonnées hors zone (${s.longitude_station}, ${s.latitude_station})`,
      );
      continue;
    }
    await upsertObjet(pool, {
      couche: "station_hydro",
      externalId: s.code_station,
      props: {
        nom: s.libelle_station,
        cours_eau: s.libelle_cours_eau,
        en_service: s.en_service,
      },
      geometry: { type: "Point", coordinates: coords },
      sourceUrl: "https://www.hydro.eaufrance.fr/",
    });
    n++;
  }

  return n;
}
