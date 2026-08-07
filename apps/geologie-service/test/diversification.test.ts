import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { BssFeature } from "../src/clients/brgm.js";
import { centreLambert93 } from "../src/domain/bbox.js";
import { construireShortlist, TAILLE_SHORTLIST_MAX } from "../src/domain/diversification.js";
import { normaliserFeature } from "../src/domain/normalisation.js";
import { baseScore, geologicalValueScore, proximityScore } from "../src/domain/scoring.js";
import type { Candidat, OuvrageBss } from "../src/types.js";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

const LAT = 44.06455556;
const LON = 3.68302778;
const RAYON = 5000;

function candidat(overrides: Partial<Candidat> = {}): Candidat {
  const base: OuvrageBss = {
    bss_id: "TEST",
    ancien_code_bss: null,
    designation: null,
    nature_brgm: null,
    distance_m: 1000,
    x_l93: 0,
    y_l93: 0,
    profondeur_m: null,
    altitude_m: null,
    mode_execution: null,
    commune_bss: null,
    lieu_dit: null,
    longitude: null,
    latitude: null,
    is_borehole: false,
    is_sounding: false,
    is_core_sample: false,
    has_geological_section: false,
    has_geological_section_document: false,
    has_geological_section_scan: false,
    documents: [],
    fiche_infoterre: null,
  };
  return { ...base, distance_rank: 0, geological_value_score: 0, proximity_score: 0, base_score: 0, ...overrides };
}

/** Reconstruit le pipeline scoring complet à partir d'un fixture GeoJSON réel du BRGM. */
function candidatsDepuisFixture(nomFichier: string): Candidat[] {
  const brut = JSON.parse(readFileSync(`${FIXTURES_DIR}${nomFichier}`, "utf-8")) as { features: BssFeature[] };
  const centre = centreLambert93(LON, LAT);
  const ouvrages = brut.features
    .map((feature) => normaliserFeature(feature, centre))
    .filter((o): o is OuvrageBss => o !== null)
    .filter((o) => o.distance_m <= RAYON)
    .sort((a, b) => a.distance_m - b.distance_m);

  return ouvrages.map((ouvrage, index) => {
    const geo = geologicalValueScore(ouvrage);
    const prox = proximityScore(ouvrage.distance_m);
    return { ...ouvrage, distance_rank: index, geological_value_score: geo, proximity_score: prox, base_score: baseScore(geo, prox) };
  });
}

test("BSS002DKFG (MONNA) entre dans la shortlist sur le cas de référence", () => {
  const shortlist = construireShortlist(candidatsDepuisFixture("sample-5km.geojson"));
  assert.ok(shortlist.some((c) => c.bss_id === "BSS002DKFG"));
});

test("BSS002DKEC (VA-2A) entre dans la shortlist malgré sa proximité de la limite des 5 km", () => {
  const shortlist = construireShortlist(candidatsDepuisFixture("sample-5km.geojson"));
  assert.ok(shortlist.some((c) => c.bss_id === "BSS002DKEC"));
});

test("les 44 candidats du cercle sont bien tous considérés (aucun pré-filtrage par distance)", () => {
  const candidats = candidatsDepuisFixture("sample-5km.geojson");
  assert.equal(candidats.length, 44);
});

test("la shortlist est plafonnée à 15 sur le cas de référence", () => {
  const shortlist = construireShortlist(candidatsDepuisFixture("sample-5km.geojson"));
  assert.equal(shortlist.length, TAILLE_SHORTLIST_MAX);
});

test("les candidats protégés recouvrent des rôles sans dupliquer artificiellement les ouvrages", () => {
  const shortlist = construireShortlist(candidatsDepuisFixture("sample-5km.geojson"));
  const va2a = shortlist.find((c) => c.bss_id === "BSS002DKEC");
  assert.ok(va2a?.protege?.includes("meilleur_sondage"));
  assert.ok(va2a?.protege?.includes("meilleur_carottage"));
  assert.ok(va2a?.protege?.includes("meilleure_coupe"));
  const monna = shortlist.find((c) => c.bss_id === "BSS002DKFG");
  assert.ok(monna?.protege?.includes("meilleur_forage_documente"));
});

test("les 5 sondages du cluster VA n'occupent pas les 5 premières places de la shortlist", () => {
  const shortlist = construireShortlist(candidatsDepuisFixture("sample-5km.geojson"));
  const clusterVa = new Set(["BSS002DKEC", "BSS002DKDD", "BSS002DKED", "BSS002DKEB", "BSS002DKEE"]);
  const cinqPremiers = shortlist.slice(0, 5).map((c) => c.bss_id);
  const nbDansLesCinqPremiers = cinqPremiers.filter((id) => clusterVa.has(id)).length;
  assert.ok(nbDansLesCinqPremiers <= 1, `attendu au plus 1 ouvrage du cluster VA en tête, trouvé ${nbDansLesCinqPremiers}`);
  // Le cluster reste néanmoins présent dans la shortlist : diversifié, pas éliminé.
  assert.ok([...clusterVa].some((id) => shortlist.some((c) => c.bss_id === id)));
});

test("départage par distance croissante entre deux candidats protégés à score égal", () => {
  const loin = candidat({
    bss_id: "FORAGE-LOIN", x_l93: 0, y_l93: 0, distance_m: 4000, distance_rank: 3,
    is_borehole: true, has_geological_section: true, base_score: 60,
  });
  const proche = candidat({
    bss_id: "FORAGE-PROCHE", x_l93: 10_000, y_l93: 10_000, distance_m: 1000, distance_rank: 1,
    is_borehole: true, has_geological_section: true, base_score: 60,
  });
  const autre = candidat({
    bss_id: "SOURCE", x_l93: 20_000, y_l93: 20_000, distance_m: 500, distance_rank: 0, base_score: 5,
  });
  const shortlist = construireShortlist([loin, proche, autre]);
  const meilleurForage = shortlist.find((c) => c.protege?.includes("meilleur_forage_documente"));
  assert.equal(meilleurForage?.bss_id, "FORAGE-PROCHE", "à score égal, le plus proche doit être retenu comme protégé");
});

test("aucun pré-limit par distance : un ouvrage riche mais lointain entre dans la shortlist devant des ouvrages proches mais pauvres", () => {
  // 15 ouvrages proches et pauvres (distance_rank 0-14), puis 5 ouvrages riches mais plus
  // lointains (distance_rank 15-19). Un pré-filtrage par distance les aurait tous exclus.
  const pauvres: Candidat[] = Array.from({ length: 15 }, (_, i) =>
    candidat({
      bss_id: `PAUVRE-${i}`, x_l93: i * 10_000, y_l93: 0, distance_m: 500 + i * 10,
      distance_rank: i, nature_brgm: "SOURCE", base_score: 10,
    }));
  const riches: Candidat[] = Array.from({ length: 5 }, (_, i) =>
    candidat({
      bss_id: `RICHE-${i}`, x_l93: i * 10_000, y_l93: 100_000, distance_m: 4800 + i * 10,
      distance_rank: 15 + i, nature_brgm: "FORAGE", is_borehole: true, has_geological_section: true,
      is_core_sample: true, profondeur_m: 80, base_score: 90,
    }));

  const shortlist = construireShortlist([...pauvres, ...riches]);
  const richesRetenus = shortlist.filter((c) => c.bss_id.startsWith("RICHE-"));
  assert.ok(richesRetenus.length >= 4, `attendu au moins 4 ouvrages riches malgré leur distance_rank élevé, trouvé ${richesRetenus.length}`);
});

test("la shortlist reste plafonnée à 15 même avec beaucoup plus de candidats disponibles", () => {
  const candidats: Candidat[] = Array.from({ length: 30 }, (_, i) =>
    candidat({
      bss_id: `C-${i}`, x_l93: i * 10_000, y_l93: i * 10_000, distance_m: 100 * (i + 1),
      distance_rank: i, base_score: 100 - i,
    }));
  const shortlist = construireShortlist(candidats);
  assert.equal(shortlist.length, TAILLE_SHORTLIST_MAX);
});

test("le rang de distance est conservé pour chaque candidat de la shortlist", () => {
  const shortlist = construireShortlist(candidatsDepuisFixture("sample-5km.geojson"));
  for (const candidat of shortlist) {
    assert.ok(Number.isInteger(candidat.distance_rank));
    assert.ok(candidat.distance_rank >= 0);
  }
});

test("un cercle vide produit une shortlist vide", () => {
  assert.deepEqual(construireShortlist([]), []);
});
