import type pg from "pg";
import { TERRITOIRE, upsertCommune } from "@opendata-vda/shared";

interface CommuneFeature {
  type: "Feature";
  geometry: unknown;
  properties: {
    code: string;
    nom: string;
    codeEpci?: string;
    population?: number;
    surface?: number;
  };
}

/** Contours de la commune Val-d'Aigoual + des 15 communes de l'EPCI + l'EPCI lui-même (geo.api.gouv.fr). */
export async function run(pool: pg.Pool): Promise<number> {
  let n = 0;

  const communeRes = await fetch(
    `https://geo.api.gouv.fr/communes/${TERRITOIRE.commune.codeInsee}` +
      `?fields=nom,code,codeEpci,population,surface,contour&format=geojson&geometry=contour`,
  );
  if (!communeRes.ok) throw new Error(`geo.api communes -> HTTP ${communeRes.status}`);
  const commune = (await communeRes.json()) as CommuneFeature;
  await upsertCommune(pool, {
    codeInsee: commune.properties.code,
    nom: commune.properties.nom,
    codeEpci: commune.properties.codeEpci ?? null,
    population: commune.properties.population ?? null,
    surfaceHa: commune.properties.surface ?? null,
    estEpciMembre: false,
    geometry: commune.geometry,
  });
  n++;

  // Récupérer et insérer l'EPCI lui-même
  const epciSelfRes = await fetch(
    `https://geo.api.gouv.fr/epcis/${TERRITOIRE.epci.code}` +
      `?fields=nom,code,surface,contour&format=geojson&geometry=contour`,
  );
  if (!epciSelfRes.ok) throw new Error(`geo.api epcis -> HTTP ${epciSelfRes.status}`);
  const epciSelf = (await epciSelfRes.json()) as CommuneFeature;
  await upsertCommune(pool, {
    codeInsee: epciSelf.properties.code,
    nom: epciSelf.properties.nom,
    codeEpci: null, // L'EPCI n'a pas de code Epci parent
    population: null, // Pas de population pour un EPCI dans cette API
    surfaceHa: epciSelf.properties.surface ?? null,
    estEpciMembre: false,
    geometry: epciSelf.geometry,
  });
  n++;

  const epciRes = await fetch(
    `https://geo.api.gouv.fr/epcis/${TERRITOIRE.epci.code}/communes` +
      `?fields=nom,code,population,surface&format=geojson&geometry=contour`,
  );
  if (!epciRes.ok) throw new Error(`geo.api epcis/communes -> HTTP ${epciRes.status}`);
  const epciCommunes = (await epciRes.json()) as { features: CommuneFeature[] };
  for (const feature of epciCommunes.features) {
    await upsertCommune(pool, {
      codeInsee: feature.properties.code,
      nom: feature.properties.nom,
      codeEpci: TERRITOIRE.epci.code,
      population: feature.properties.population ?? null,
      surfaceHa: feature.properties.surface ?? null,
      estEpciMembre: true,
      geometry: feature.geometry,
    });
    n++;
  }

  return n;
}
