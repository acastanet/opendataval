import type pg from "pg";
import { TERRITOIRE } from "@opendata-vda/shared";

const EPCI_CODE = "200034601";
const ZNIEFF_ID = "910011858";
const ZNIEFF_URL = "https://apicarto.ign.fr/api/nature/znieff2";
const DEPARTEMENT_CODE = "30";

interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

interface GeoJsonFeature {
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

function pointAigoual(): string {
  return JSON.stringify({
    type: "Point",
    coordinates: [TERRITOIRE.montAigoual.lon, TERRITOIRE.montAigoual.lat],
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "OpenDataVdA/1.0 (+https://opendata.valdaigoual.fr)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Zones incendies ${url} -> HTTP ${response.status}`);
  return (await response.json()) as T;
}

function geometryCollection(features: GeoJsonFeature[]): string {
  const geometries = features.map((feature) => feature.geometry).filter((geometry): geometry is GeoJsonGeometry => geometry !== null);
  if (geometries.length === 0) throw new Error("Zones incendies : aucune géométrie reçue");
  return JSON.stringify({ type: "GeometryCollection", geometries });
}

async function upsertDepartement(pool: pg.Pool, communesGeometry: string): Promise<void> {
  // Pas de contour direct sur /departements/{code} côté geo.api.gouv.fr : reconstitué par
  // union des contours de ses communes (même stratégie que la zone cœur EPCI ci-dessous).
  await pool.query(
    `insert into incendies.zones (slug, nom, type_zone, source, version_source, geom, maj)
     select 'departement_30', 'Département du Gard', 'departement',
            'geo.api.gouv.fr/communes?codeDepartement=30', '2026-07-17',
            ST_Multi(ST_CollectionExtract(ST_UnaryUnion(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 3)), now()
     on conflict (slug) do update set
       nom = excluded.nom, type_zone = excluded.type_zone, source = excluded.source,
       version_source = excluded.version_source, geom = excluded.geom, maj = now()`,
    [communesGeometry],
  );
}

async function upsertZones(pool: pg.Pool, epciGeometry: string, znieffGeometry: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into incendies.zones (slug, nom, type_zone, source, version_source, geom, maj)
       select 'coeur', 'Zone cœur incendies', 'coeur',
              'EPCI 200034601 + ZNIEFF II 910011858', '2026-07-17',
              ST_Multi(ST_CollectionExtract(ST_Union(
                ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
                ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
              ), 3)), now()
       on conflict (slug) do update set
         nom = excluded.nom, type_zone = excluded.type_zone, source = excluded.source,
         version_source = excluded.version_source, geom = excluded.geom, maj = now()`,
      [epciGeometry, znieffGeometry],
    );
    await client.query(
      `insert into incendies.zones (slug, nom, type_zone, source, version_source, geom, maj)
       select 'proche_5km', 'Zone proche incendies — 5 km', 'proche_5km', source, version_source,
              ST_Multi(ST_Transform(ST_Buffer(ST_Transform(geom, 2154), 5000), 4326)), now()
         from incendies.zones where slug = 'coeur'
       on conflict (slug) do update set
         nom = excluded.nom, type_zone = excluded.type_zone, source = excluded.source,
         version_source = excluded.version_source, geom = excluded.geom, maj = now()`,
    );
    await client.query(
      `insert into incendies.zones (slug, nom, type_zone, source, version_source, geom, maj)
       select 'veille_15km', 'Zone de veille incendies — 15 km', 'veille_15km', source, version_source,
              ST_Multi(ST_Transform(ST_Buffer(ST_Transform(geom, 2154), 15000), 4326)), now()
         from incendies.zones where slug = 'coeur'
       on conflict (slug) do update set
         nom = excluded.nom, type_zone = excluded.type_zone, source = excluded.source,
         version_source = excluded.version_source, geom = excluded.geom, maj = now()`,
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Construit la zone cœur EPCI + ZNIEFF, les tampons métriques de 5 et 15 km, et le contour du département. */
export async function run(pool: pg.Pool): Promise<number> {
  const epciUrl = `https://geo.api.gouv.fr/epcis/${EPCI_CODE}/communes?fields=nom,code,contour&format=geojson&geometry=contour`;
  const znieffUrl = `${ZNIEFF_URL}?geom=${encodeURIComponent(pointAigoual())}`;
  const departementUrl = `https://geo.api.gouv.fr/communes?codeDepartement=${DEPARTEMENT_CODE}&fields=nom,code&format=geojson&geometry=contour`;
  const [epci, znieff, departementCommunes] = await Promise.all([
    fetchJson<GeoJsonFeatureCollection>(epciUrl),
    fetchJson<GeoJsonFeatureCollection>(znieffUrl),
    fetchJson<GeoJsonFeatureCollection>(departementUrl),
  ]);
  const selectedZnieff = znieff.features.filter((feature) => String(feature.properties.id_mnhn) === ZNIEFF_ID);
  if (selectedZnieff.length !== 1) {
    throw new Error(`Zones incendies : ZNIEFF II ${ZNIEFF_ID} introuvable ou ambiguë`);
  }
  if (departementCommunes.features.length < 300) {
    throw new Error(`Zones incendies : ${departementCommunes.features.length}/~350 communes du Gard reçues`);
  }

  await upsertZones(pool, geometryCollection(epci.features), geometryCollection(selectedZnieff));
  await upsertDepartement(pool, geometryCollection(departementCommunes.features));
  return 4;
}
