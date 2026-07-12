import type pg from "pg";
import { TERRITOIRE, upsertObjet } from "@opendata-vda/shared";

interface NatureFeature {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown>;
}

interface NatureFeatureCollection {
  type: "FeatureCollection";
  features: NatureFeature[];
}

const POINT_AIGOUAL = JSON.stringify({
  type: "Point",
  coordinates: [TERRITOIRE.montAigoual.lon, TERRITOIRE.montAigoual.lat],
});

/** Zonages environnementaux (Natura 2000, ZNIEFF) recoupant le Mont Aigoual — API Carto IGN. */
export async function run(pool: pg.Pool): Promise<number> {
  let n = 0;

  const natura = await fetchNature(
    `https://apicarto.ign.fr/api/nature/natura-habitat?geom=${encodeURIComponent(POINT_AIGOUAL)}`,
  );
  for (const f of natura.features) {
    const p = f.properties;
    await upsertObjet(pool, {
      couche: "natura2000",
      externalId: String(p.sitecode ?? p.cd_sig),
      props: { code: p.sitecode, nom: p.sitename, gestionnaire: p.gest_site },
      geometry: f.geometry,
      sourceUrl: `https://inpn.mnhn.fr/site/natura2000/${p.sitecode}`,
    });
    n++;
  }

  const znieff = await fetchNature(
    `https://apicarto.ign.fr/api/nature/znieff1?geom=${encodeURIComponent(POINT_AIGOUAL)}`,
  );
  for (const f of znieff.features) {
    const p = f.properties;
    await upsertObjet(pool, {
      couche: "znieff",
      externalId: String(p.id_mnhn ?? p.cd_sig),
      props: { id_mnhn: p.id_mnhn, nom: p.nom, gestionnaire: p.gest_site },
      geometry: f.geometry,
      sourceUrl: `https://inpn.mnhn.fr/zone/znieff/${p.id_mnhn}`,
    });
    n++;
  }

  return n;
}

async function fetchNature(url: string): Promise<NatureFeatureCollection> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Carto Nature ${url} -> HTTP ${res.status}`);
  return (await res.json()) as NatureFeatureCollection;
}
