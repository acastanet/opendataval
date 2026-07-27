import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { AssociationConfig } from "./config.js";
import type { AssociationSummary } from "./types.js";

type CachedLocation = NonNullable<AssociationSummary["location"]>;

const MUNICIPALITY_FALLBACK = {
  latitude: 44.0812,
  longitude: 3.6421,
} as const;

async function loadCache(
  path: string,
): Promise<Record<string, CachedLocation>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      CachedLocation
    >;
  } catch {
    return {};
  }
}

function queryFor(association: AssociationSummary): string {
  return [
    association.address.label,
    association.address.street,
    association.address.postalCode,
    association.address.municipalityName,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Géocode une association déjà filtrée. Réutilise le cache existant, respecte
 * le service de géocodage (un appel par requête distincte), conserve la
 * précision et le score. En cas d'échec, repli sur le centroïde communal
 * (`precision = "municipality"`). Un échec de géocodage n'annule jamais tout
 * le snapshot.
 */
export async function geocode(
  association: AssociationSummary,
  cache: Record<string, CachedLocation>,
  config: AssociationConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const query = queryFor(association);
  if (!query) {
    association.location = { ...MUNICIPALITY_FALLBACK, precision: "municipality", score: null };
    return;
  }
  if (cache[query]) {
    association.location = cache[query];
    return;
  }
  try {
    const url = new URL(config.geocodingUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "1");
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(config.geocodingTimeoutMs),
    });
    const body = (await response.json()) as {
      features?: Array<{
        geometry?: { coordinates?: unknown[] };
        properties?: { score?: unknown; type?: unknown };
      }>;
    };
    const feature = body.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (
      Array.isArray(coordinates) &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      const location: CachedLocation = {
        longitude: coordinates[0] as number,
        latitude: coordinates[1] as number,
        score:
          typeof feature?.properties?.score === "number"
            ? (feature.properties.score as number)
            : null,
        precision:
          feature?.properties?.type === "housenumber" ? "address" : "street",
      };
      cache[query] = location;
      association.location = location;
      return;
    }
  } catch {
    // Le repli communal maintient le snapshot exploitable.
  }
  association.location = { ...MUNICIPALITY_FALLBACK, precision: "municipality", score: null };
}

export async function loadGeocodingCache(
  config: AssociationConfig,
): Promise<Record<string, CachedLocation>> {
  return loadCache(resolve(config.dataDir, "geocoding-cache.json"));
}

export async function saveGeocodingCache(
  config: AssociationConfig,
  cache: Record<string, CachedLocation>,
): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(
    resolve(config.dataDir, "geocoding-cache.json"),
    JSON.stringify(cache),
  );
}
