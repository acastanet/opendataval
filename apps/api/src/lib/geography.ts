export const GEOGRAPHY_UNAVAILABLE_SOURCES = {
  administrative: "Géocodage IGN",
  altitude: "Altimétrie IGN",
} as const;

export interface Municipality {
  name: string;
  inseeCode: string;
}

export interface Department {
  name: string;
  code: string;
}

export interface ResolvedGeography {
  coordinates: {
    latitude: number;
    longitude: number;
  };
  label: string;
  municipality: Municipality | null;
  department: Department | null;
  altitudeM: number | null;
  resolution: {
    administrative: "ign" | "unavailable";
    altitude: "ign" | "unavailable";
  };
  unavailableSources: string[];
  generatedAt: string;
}

export interface GeographyResolver {
  resolve(latitude: number, longitude: number): Promise<ResolvedGeography>;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface GeographyResolverOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  now?: () => number;
}

interface AdministrativeResolution {
  municipality: Municipality;
  department: Department;
}

interface CacheEntry {
  expiresAt: number;
  value: ResolvedGeography;
}

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function stringValue(object: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function normalizeMunicipality(name: string, inseeCode: string): Municipality | null {
  const code = inseeCode.trim().toUpperCase();
  if (!/^(?:\d{5}|2[AB]\d{3})$/.test(code)) return null;

  if (/^751(?:0[1-9]|1\d|20)$/.test(code)) {
    return { name: "Paris", inseeCode: "75056" };
  }
  if (/^6938[1-9]$/.test(code)) {
    return { name: "Lyon", inseeCode: "69123" };
  }
  if (/^132(?:0[1-9]|1[0-6])$/.test(code)) {
    return { name: "Marseille", inseeCode: "13055" };
  }

  return { name, inseeCode: code };
}

export function departmentCodeFromInsee(inseeCode: string): string | null {
  const code = inseeCode.trim().toUpperCase();
  if (/^2[AB]\d{3}$/.test(code)) return code.slice(0, 2);
  if (/^(?:97|98)\d{3}$/.test(code)) return code.slice(0, 3);
  if (/^\d{5}$/.test(code)) return code.slice(0, 2);
  return null;
}

function departmentNameFromContext(context: string | null, departmentCode: string): string {
  if (!context) return `Département ${departmentCode}`;
  const parts = context.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[0]?.toUpperCase() === departmentCode.toUpperCase() && parts[1]
    ? parts[1]
    : `Département ${departmentCode}`;
}

function parseAdministrativeResponse(data: unknown): AdministrativeResolution | null {
  const root = objectValue(data);
  const features = root?.features;
  if (!Array.isArray(features) || features.length === 0) return null;

  const feature = objectValue(features[0]);
  const properties = objectValue(feature?.properties);
  if (!properties) return null;

  const city = stringValue(properties, "city", "municipality", "commune");
  const cityCode = stringValue(properties, "citycode", "city_code", "insee_code");
  if (!city || !cityCode) return null;

  const municipality = normalizeMunicipality(city, cityCode);
  if (!municipality) return null;
  const departmentCode = departmentCodeFromInsee(municipality.inseeCode);
  if (!departmentCode) return null;

  const context = stringValue(properties, "context");
  return {
    municipality,
    department: {
      name: departmentNameFromContext(context, departmentCode),
      code: departmentCode,
    },
  };
}

function parseAltitudeResponse(data: unknown): number | null {
  const root = objectValue(data);
  const elevations = root?.elevations;
  if (!Array.isArray(elevations) || elevations.length === 0) return null;

  const first = elevations[0];
  const altitude = typeof first === "number"
    ? first
    : objectValue(first)?.z;
  if (typeof altitude !== "number" || !Number.isFinite(altitude) || altitude === -99_999) {
    return null;
  }
  return Math.round(altitude);
}

function reverseGeocodingUrl(latitude: number, longitude: number): string {
  const url = new URL("https://data.geopf.fr/geocodage/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("index", "address");
  url.searchParams.set("limit", "1");
  return url.toString();
}

function altitudeUrl(latitude: number, longitude: number): string {
  const url = new URL(
    "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json",
  );
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("resource", "ign_rge_alti_wld");
  url.searchParams.set("indent", "false");
  url.searchParams.set("measures", "false");
  url.searchParams.set("zonly", "false");
  return url.toString();
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "opendata-vda-api/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Service géographique HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function unavailableGeography(
  latitude: number,
  longitude: number,
  generatedAt = new Date().toISOString(),
): ResolvedGeography {
  return {
    coordinates: { latitude, longitude },
    label: "Position sélectionnée",
    municipality: null,
    department: null,
    altitudeM: null,
    resolution: {
      administrative: "unavailable",
      altitude: "unavailable",
    },
    unavailableSources: [
      GEOGRAPHY_UNAVAILABLE_SOURCES.administrative,
      GEOGRAPHY_UNAVAILABLE_SOURCES.altitude,
    ],
    generatedAt,
  };
}

export function createGeographyResolver(
  options: GeographyResolverOptions = {},
): GeographyResolver {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cacheMaxEntries = options.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<ResolvedGeography>>();

  async function resolveUncached(
    latitude: number,
    longitude: number,
  ): Promise<ResolvedGeography> {
    const generatedAt = new Date(now()).toISOString();
    const [administrative, altitudeM] = await Promise.all([
      fetchJson(fetchImpl, reverseGeocodingUrl(latitude, longitude), timeoutMs)
        .then(parseAdministrativeResponse)
        .catch(() => null),
      fetchJson(fetchImpl, altitudeUrl(latitude, longitude), timeoutMs)
        .then(parseAltitudeResponse)
        .catch(() => null),
    ]);

    const unavailableSources: string[] = [];
    if (!administrative) unavailableSources.push(GEOGRAPHY_UNAVAILABLE_SOURCES.administrative);
    if (altitudeM === null) unavailableSources.push(GEOGRAPHY_UNAVAILABLE_SOURCES.altitude);

    return {
      coordinates: { latitude, longitude },
      label: administrative?.municipality.name ?? "Position sélectionnée",
      municipality: administrative?.municipality ?? null,
      department: administrative?.department ?? null,
      altitudeM,
      resolution: {
        administrative: administrative ? "ign" : "unavailable",
        altitude: altitudeM === null ? "unavailable" : "ign",
      },
      unavailableSources,
      generatedAt,
    };
  }

  return {
    async resolve(latitude: number, longitude: number): Promise<ResolvedGeography> {
      const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) {
        cache.delete(key);
        cache.set(key, cached);
        return cached.value;
      }
      if (cached) cache.delete(key);

      const pending = inFlight.get(key);
      if (pending) return pending;

      const resolution = resolveUncached(latitude, longitude)
        .then((value) => {
          while (cache.size >= cacheMaxEntries) {
            const oldestKey = cache.keys().next().value as string | undefined;
            if (oldestKey === undefined) break;
            cache.delete(oldestKey);
          }
          cache.set(key, { expiresAt: now() + cacheTtlMs, value });
          return value;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, resolution);
      return resolution;
    },
  };
}
