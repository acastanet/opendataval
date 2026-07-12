import type pg from "pg";
import { TERRITOIRE, upsertObjet } from "@opendata-vda/shared";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/** Miroirs publics Overpass, essayés dans l'ordre en cas d'erreur (502/504 fréquents sous charge). */
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function requeterOverpass(query: string): Promise<OverpassResponse> {
  let derniereErreur: Error | undefined;
  for (const endpoint of ENDPOINTS) {
    for (let tentative = 0; tentative < 2; tentative++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain", "User-Agent": "opendata-vda-worker/1.0" },
          body: query,
        });
        if (!res.ok) throw new Error(`Overpass (${endpoint}) -> HTTP ${res.status}`);
        return (await res.json()) as OverpassResponse;
      } catch (err) {
        derniereErreur = err as Error;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw derniereErreur ?? new Error("Overpass indisponible");
}

/** POI notables (sommets, mairie, tourisme...) sur le territoire, via Overpass (OSM, ODbL). */
export async function run(pool: pg.Pool): Promise<number> {
  const [west, south, east, north] = TERRITOIRE.bbox;
  const bbox = `${south},${west},${north},${east}`;
  const query = `
    [out:json][timeout:60];
    (
      node["natural"="peak"](${bbox});
      node["amenity"="townhall"](${bbox});
      node["tourism"](${bbox});
      node["amenity"="drinking_water"](${bbox});
    );
    out center tags;
  `.trim();

  const { elements } = await requeterOverpass(query);

  let n = 0;
  for (const el of elements) {
    const lon = el.lon ?? el.center?.lon;
    const lat = el.lat ?? el.center?.lat;
    if (lon == null || lat == null) continue;
    await upsertObjet(pool, {
      couche: "poi_osm",
      externalId: `${el.type}/${el.id}`,
      props: { nom: el.tags?.name ?? null, tags: el.tags ?? {} },
      geometry: { type: "Point", coordinates: [lon, lat] },
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    });
    n++;
  }
  return n;
}
