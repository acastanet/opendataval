import type pg from "pg";
import { TERRITOIRE, upsertObjetsEnLot, type ObjetInput } from "@opendata-vda/shared";

/** Édition RPG la plus récente publiée par l'IGN (couche WFS `RPG.{MILLESIME}:*`) — à relever d'un
 * an lors de la parution de la prochaine édition (cf. https://data.geopf.fr/wfs/ows?SERVICE=WFS&REQUEST=GetCapabilities). */
const MILLESIME = "2024";
const WFS_URL = "https://data.geopf.fr/wfs/ows";

interface CodeCultureFeature {
  properties: { code: string; libelle: string };
}

interface ParcelleFeature {
  id: string;
  geometry: unknown;
  properties: { id_parcel: string; surf_parc: number; code_cultu: string };
}

interface WfsFeatureCollection<T> {
  features: T[];
}

async function chargerLibellesCultures(): Promise<Record<string, string>> {
  const url =
    `${WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=RPG.${MILLESIME}:codes_cultures&outputFormat=application/json&COUNT=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RPG codes_cultures -> HTTP ${res.status}`);
  const { features } = (await res.json()) as WfsFeatureCollection<CodeCultureFeature>;
  return Object.fromEntries(features.map((f) => [f.properties.code, f.properties.libelle]));
}

/**
 * Parcelles agricoles du Registre Parcellaire Graphique (RPG), filtrées sur la bbox du territoire
 * via le WFS IGN Geoplateforme (couche `parcelles_graphiques`, EPSG:4326, ordre lat/lon en BBOX
 * WFS 2.0.0) — pas de téléchargement départemental nécessaire, la couche est directement
 * interrogeable par emprise géographique.
 */
export async function run(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ debut: Date }>("select now() as debut");
  const debut = rows[0]?.debut;
  if (!debut) throw new Error("rpg : horodatage de départ indisponible");

  const libelles = await chargerLibellesCultures();

  const [ouest, sud, est, nord] = TERRITOIRE.bbox;
  const url =
    `${WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=RPG.${MILLESIME}:parcelles_graphiques&BBOX=${sud},${ouest},${nord},${est}` +
    `&outputFormat=application/json&COUNT=5000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RPG parcelles_graphiques -> HTTP ${res.status}`);
  const { features } = (await res.json()) as WfsFeatureCollection<ParcelleFeature>;

  const lot: ObjetInput[] = [];
  let n = 0;

  const vider = async (): Promise<void> => {
    if (lot.length === 0) return;
    await upsertObjetsEnLot(pool, lot.splice(0, lot.length));
  };

  for (const f of features) {
    lot.push({
      couche: "parcelle_agricole",
      externalId: f.id,
      props: {
        codeCulture: f.properties.code_cultu,
        libelleCulture: libelles[f.properties.code_cultu] ?? null,
        surfaceHa: f.properties.surf_parc,
      },
      geometry: f.geometry,
      sourceUrl: "https://geoservices.ign.fr/rpg",
    });
    n++;
    if (lot.length >= 500) await vider();
  }
  await vider();

  await pool.query("delete from couches.objets where couche = 'parcelle_agricole' and maj < $1", [debut]);
  return n;
}
