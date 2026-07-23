import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import { parseStationCatalogueCsv, run } from "./meteo_stations.js";

const catalogueCsv = [
  "\uFEFFId_station;Nom_usuel;Latitude;Longitude;Altitude;Pack",
  '1234567;"Paris-Montsouris";48,8217;2,3378;75;RADOME',
  '13054001;"Marseille-Marignane";43.4377;5.2160;9;ETENDU',
  '13054001;"Marseille-Marignane actualisée";43.4378;5.2161;10;horaire',
  'invalide;"Sans identifiant";44;3;400;RADOME',
  '99999999;"Coordonnées invalides";120;3;400;RADOME',
].join("\n");

test("parse le CSV Météo-France sans perdre les zéros initiaux", () => {
  const parsed = parseStationCatalogueCsv(catalogueCsv);

  assert.equal(parsed.stations.length, 2);
  assert.equal(parsed.rejectedRows, 2);
  assert.equal(parsed.duplicateRows, 1);
  assert.deepEqual(parsed.stations[0], {
    id: "01234567",
    nom: "Paris-Montsouris",
    altitudeM: 75,
    lon: 2.3378,
    lat: 48.8217,
    reseau: "meteofrance",
    pack: "RADOME",
    licence: "Licence Ouverte 2.0 (ETALAB)",
  });
  assert.deepEqual(parsed.stations[1], {
    id: "13054001",
    nom: "Marseille-Marignane actualisée",
    altitudeM: 10,
    lon: 5.2161,
    lat: 43.4378,
    reseau: "meteofrance",
    pack: "ETENDU",
    licence: "Licence Ouverte 2.0 (ETALAB)",
  });
});

test("refuse un catalogue dont les colonnes obligatoires sont absentes", () => {
  assert.throws(
    () => parseStationCatalogueCsv("id;nom\n123;Station"),
    /colonnes obligatoires absentes/,
  );
});

test("importe les stations dans la couche PostGIS et signale un catalogue partiel", { concurrency: false }, async () => {
  const queries: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      return { rows: [], rowCount: 2 };
    },
  } as unknown as pg.Pool;

  const initialFetch = globalThis.fetch;
  const initialToken = process.env.METEOFRANCE_API_TOKEN;
  const initialUrl = process.env.METEOFRANCE_STATIONS_URL;
  process.env.METEOFRANCE_API_TOKEN = "token-test";
  process.env.METEOFRANCE_STATIONS_URL = "https://example.test/liste-stations";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://example.test/liste-stations");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer token-test");
    assert.equal(headers.apikey, "token-test");
    return new Response(catalogueCsv, { status: 200 });
  };

  try {
    const result = await run(pool);
    assert.deepEqual(result, {
      nbLignes: 2,
      statut: "partiel",
      avertissement: "2 lignes rejetées ; 1 doublons remplacés ; catalogue incomplet probable : 2 stations",
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0]?.sql ?? "", /insert into couches\.objets/);
    assert.deepEqual(queries[0]?.values?.[0], ["station_meteo", "station_meteo"]);
    assert.deepEqual(queries[0]?.values?.[1], ["01234567", "13054001"]);
  } finally {
    globalThis.fetch = initialFetch;
    if (initialToken === undefined) delete process.env.METEOFRANCE_API_TOKEN;
    else process.env.METEOFRANCE_API_TOKEN = initialToken;
    if (initialUrl === undefined) delete process.env.METEOFRANCE_STATIONS_URL;
    else process.env.METEOFRANCE_STATIONS_URL = initialUrl;
  }
});
