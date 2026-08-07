import assert from "node:assert/strict";
import test from "node:test";
import type { BssFeature } from "../src/clients/brgm.js";
import { normaliserFeature } from "../src/domain/normalisation.js";

const CENTRE = { x: 754_720.330836965, y: 6_329_742.589097344 };

function feature(props: Partial<Record<string, string>>): BssFeature {
  const base: Record<string, string> = {
    bss_id: "", reference: "", designation: "", nature: "",
    prof_atteinte: "", zsol: "", mode_execution: "",
    nom_commune: "", lieu_dit: "", longitude: "", latitude: "",
    x_ref06: "", y_ref06: "", coupe_geologique: "", documents: "",
    nb_scans_coupe: "",
  };
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { ...base, ...props },
  };
}

// MONNA, ouvrage de référence §28.
const MONNA = feature({
  bss_id: "BSS002DKFG",
  reference: "09372X0012/MONNA",
  designation: "MONNA",
  nature: "FORAGE",
  prof_atteinte: "97.00",
  zsol: "510",
  mode_execution: "MARTEAU-FOND.",
  coupe_geologique: "Presente",
  documents: "COUPE-GEOLOGIQUE,COUPE-TECHNIQUE,PRODUCTIVITE.",
  nb_scans_coupe: "1",
  longitude: "3.70350703",
  latitude: "44.06481465",
  x_ref06: "756361",
  y_ref06: "6329785",
  lieu_dit: "LE MONNA (F1)",
  nom_commune: "NOTRE DAME DE LA ROUVIERE",
});

// VA-2A, ouvrage de référence §28.
const VA2A = feature({
  bss_id: "BSS002DKEC",
  reference: "09371X0028/VA-2A",
  designation: "VA-2A",
  nature: "SONDAGE",
  prof_atteinte: "14.00",
  zsol: "232.22",
  mode_execution: "ROTATION,CAROTTAGE,EAU.",
  coupe_geologique: "Presente",
  documents: "COUPE-GEOLOGIQUE,PERMEABILITE.",
  nb_scans_coupe: "2",
  longitude: "3.67646538",
  latitude: "44.02076180",
  x_ref06: "754237",
  y_ref06: "6324872",
  lieu_dit: "AMENAGEMENT DU MONT AIGOUAL - USINE DE LA VALETTE - SONDAGE VA-2A",
  nom_commune: "SAINT ANDRE DE MAJENCOULES",
});

test("normalise complètement un forage documenté (MONNA)", () => {
  const ouvrage = normaliserFeature(MONNA, CENTRE);
  assert.ok(ouvrage);
  assert.equal(ouvrage.bss_id, "BSS002DKFG");
  assert.equal(ouvrage.ancien_code_bss, "09372X0012/MONNA");
  assert.equal(ouvrage.nature_brgm, "FORAGE");
  assert.equal(ouvrage.profondeur_m, 97);
  assert.equal(ouvrage.altitude_m, 510);
  assert.ok(Math.abs(ouvrage.distance_m - 1641.2) < 1, `distance = ${ouvrage.distance_m}`);
  assert.equal(ouvrage.fiche_infoterre, "http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=09372X0012%2FMONNA");
});

test("détecte un FORAGE via is_borehole", () => {
  const ouvrage = normaliserFeature(MONNA, CENTRE);
  assert.equal(ouvrage?.is_borehole, true);
  assert.equal(ouvrage?.is_sounding, false);
});

test("détecte un SONDAGE* via is_sounding", () => {
  const ouvrage = normaliserFeature(VA2A, CENTRE);
  assert.equal(ouvrage?.is_sounding, true);
  assert.equal(ouvrage?.is_borehole, false);
});

test("détecte le CAROTTAGE via le mode d'exécution, insensible à la casse", () => {
  const ouvrage = normaliserFeature(VA2A, CENTRE);
  assert.equal(ouvrage?.is_core_sample, true);

  const minuscule = normaliserFeature(feature({ ...VA2A.properties, mode_execution: "rotation,carottage,eau." }), CENTRE);
  assert.equal(minuscule?.is_core_sample, true);
});

test("détecte la coupe géologique déclarée malgré la casse mixte « Presente »", () => {
  // Piège confirmé sur les données réelles : le BRGM renvoie "Presente", pas "PRESENTE".
  const ouvrage = normaliserFeature(VA2A, CENTRE);
  assert.equal(ouvrage?.has_geological_section, true);

  const absente = normaliserFeature(feature({ ...VA2A.properties, coupe_geologique: "Absente" }), CENTRE);
  assert.equal(absente?.has_geological_section, false);
});

test("détecte le document de coupe géologique dans la liste de documents", () => {
  const ouvrage = normaliserFeature(VA2A, CENTRE);
  assert.equal(ouvrage?.has_geological_section_document, true);
  assert.deepEqual(ouvrage?.documents, ["COUPE-GEOLOGIQUE", "PERMEABILITE"]);
});

test("détecte un scan de coupe disponible", () => {
  const ouvrage = normaliserFeature(VA2A, CENTRE);
  assert.equal(ouvrage?.has_geological_section_scan, true);

  const sansScan = normaliserFeature(feature({ ...VA2A.properties, nb_scans_coupe: "0" }), CENTRE);
  assert.equal(sansScan?.has_geological_section_scan, false);
});

test("profondeur absente devient null plutôt que zéro", () => {
  const ouvrage = normaliserFeature(feature({ bss_id: "X", x_ref06: "0", y_ref06: "0", prof_atteinte: "" }), CENTRE);
  assert.equal(ouvrage?.profondeur_m, null);
});

test("ignore une feature sans bss_id", () => {
  const ouvrage = normaliserFeature(feature({ bss_id: "", x_ref06: "1", y_ref06: "1" }), CENTRE);
  assert.equal(ouvrage, null);
});

test("ignore une feature sans coordonnées Lambert exploitables", () => {
  const ouvrage = normaliserFeature(feature({ bss_id: "X", x_ref06: "", y_ref06: "" }), CENTRE);
  assert.equal(ouvrage, null);
});
