import type pg from "pg";
import type { StationMeteo } from "@opendata-vda/shared";
import { upsertStationsObjets } from "./meteo_commun.js";

const DEFAULT_STATIONS_URL = "https://public-api.meteofrance.fr/public/DPObs/v2/liste-stations";
const LICENCE_OUVERTE = "Licence Ouverte 2.0 (ETALAB)";

export interface ParsedStationCatalogue {
  stations: StationMeteo[];
  rejectedRows: number;
  duplicateRows: number;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectDelimiter(header: string): ";" | "," {
  const semicolons = [...header].filter((character) => character === ";").length;
  const commas = [...header].filter((character) => character === ",").length;
  return semicolons >= commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function columnIndex(headers: readonly string[], aliases: readonly string[]): number {
  return aliases.map((alias) => headers.indexOf(alias)).find((index) => index >= 0) ?? -1;
}

function numberValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function stationId(value: string | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!/^\d{1,8}$/.test(raw)) return null;
  return raw.padStart(8, "0");
}

function stationPack(value: string | undefined): StationMeteo["pack"] | undefined {
  const normalized = normalizeHeader(value ?? "");
  if (normalized.includes("radome") || normalized.includes("6mn") || normalized.includes("6_min")) {
    return "RADOME";
  }
  if (normalized.includes("etendu") || normalized.includes("horaire")) {
    return "ETENDU";
  }
  return undefined;
}

export function parseStationCatalogueCsv(csv: string): ParsedStationCatalogue {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headerLine = lines[0];
  if (!headerLine) throw new Error("meteo_stations : catalogue CSV vide");

  const delimiter = detectDelimiter(headerLine);
  const headers = parseCsvLine(headerLine, delimiter).map(normalizeHeader);
  const idIndex = columnIndex(headers, ["id_station", "idstation", "num_poste", "numero_poste"]);
  const nameIndex = columnIndex(headers, ["nom_usuel", "nom_station", "nom", "libelle"]);
  const latitudeIndex = columnIndex(headers, ["latitude", "lat"]);
  const longitudeIndex = columnIndex(headers, ["longitude", "lon", "lng"]);
  const altitudeIndex = columnIndex(headers, ["altitude", "altitude_m", "altitudem"]);
  const packIndex = columnIndex(headers, ["pack", "type_poste", "type_station", "frequence"]);

  if (
    idIndex < 0
    || nameIndex < 0
    || latitudeIndex < 0
    || longitudeIndex < 0
    || altitudeIndex < 0
  ) {
    throw new Error(
      `meteo_stations : colonnes obligatoires absentes (${headers.join(", ")})`,
    );
  }

  const stationsById = new Map<string, StationMeteo>();
  let rejectedRows = 0;
  let duplicateRows = 0;

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line, delimiter);
    const id = stationId(values[idIndex]);
    const name = values[nameIndex]?.trim() ?? "";
    const lat = numberValue(values[latitudeIndex]);
    const lon = numberValue(values[longitudeIndex]);
    const altitudeM = numberValue(values[altitudeIndex]);

    if (
      id === null
      || name.length === 0
      || lat === null
      || lon === null
      || altitudeM === null
      || lat < -90
      || lat > 90
      || lon < -180
      || lon > 180
    ) {
      rejectedRows += 1;
      continue;
    }

    if (stationsById.has(id)) duplicateRows += 1;
    const pack = packIndex >= 0 ? stationPack(values[packIndex]) : undefined;
    stationsById.set(id, {
      id,
      nom: name,
      altitudeM,
      lon,
      lat,
      reseau: "meteofrance",
      ...(pack ? { pack } : {}),
      licence: LICENCE_OUVERTE,
    });
  }

  return {
    stations: [...stationsById.values()],
    rejectedRows,
    duplicateRows,
  };
}

export async function run(
  pool: pg.Pool,
): Promise<number | { nbLignes: number; statut: "ok" | "partiel"; avertissement?: string }> {
  const token = process.env.METEOFRANCE_STATIONS_API_TOKEN;
  if (!token) throw new Error("meteo_stations : METEOFRANCE_STATIONS_API_TOKEN absent");

  const url = process.env.METEOFRANCE_STATIONS_URL ?? DEFAULT_STATIONS_URL;
  const response = await fetch(url, {
    headers: {
      accept: "text/csv,*/*",
      Authorization: `Bearer ${token}`,
      apikey: token,
      "User-Agent": "opendata-vda-worker/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`meteo_stations -> HTTP ${response.status}`);

  const parsed = parseStationCatalogueCsv(await response.text());
  if (parsed.stations.length === 0) {
    throw new Error("meteo_stations : aucune station valide dans le catalogue reçu");
  }

  await upsertStationsObjets(pool, parsed.stations);

  const warnings: string[] = [];
  if (parsed.rejectedRows > 0) warnings.push(`${parsed.rejectedRows} lignes rejetées`);
  if (parsed.duplicateRows > 0) warnings.push(`${parsed.duplicateRows} doublons remplacés`);
  if (parsed.stations.length < 1_000) {
    warnings.push(`catalogue incomplet probable : ${parsed.stations.length} stations`);
  }

  return warnings.length === 0
    ? parsed.stations.length
    : {
      nbLignes: parsed.stations.length,
      statut: "partiel",
      avertissement: warnings.join(" ; "),
    };
}
