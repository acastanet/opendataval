import assert from "node:assert/strict";
import test from "node:test";
import { adaptImportRow, adaptWaldecRow } from "../src/adapters.js";
import {
  normalizeCommune,
  normalizeStatus,
  normalizedText,
  validDate,
  validTimestamp,
} from "../src/normalization.js";

const importedAt = "2026-01-01T00:00:00Z";
const WALDEC_ROW = {
  id: "W303000001",
  id_ex: "0301000001",
  titre: "Mémoire de l'Aigoual",
  titre_court: "MEMOIRE AIGOUAL",
  objet: "Conservation du patrimoine",
  objet_social1: "006100",
  objet_social2: "006100",
  adrs_complement: "",
  adrs_numvoie: "1",
  adrs_repetition: "",
  adrs_typevoie: "rue",
  adrs_libvoie: "de la Mairie",
  adrs_distrib: "",
  adrs_codeinsee: "30339",
  adrs_codepostal: "30570",
  adrs_libcommune: "VALLERAUGUE",
  siteweb: "https://example.test",
  position: "A",
  date_creat: "2004-02-19",
  date_decla: "2016-12-07",
  date_disso: "0001-01-01",
  maj_time: "2021-08-06 15:57:08",
};
const IMPORT_ROW = {
  id: "0031900001",
  id_ex: "0301900001",
  titre: "Foyer rural de la Rouvière",
  objet: "Animations culturelles",
  objet_social1: "011000",
  objet_social2: "000000",
  adr1: "Salle des fêtes",
  adr2: "",
  adr3: "",
  adrs_codepostal: "30570",
  libcom: "NOTRE-DAME-DE-LA-ROUVIERE",
  siteweb: "",
  observation: "",
  position: "D",
  date_creat: "1985-03-18",
  maj_time: "2021-08-06 15:57:08",
};

test("adapte une ligne Waldec vers le contrat public", () => {
  const { association, rejected } = adaptWaldecRow(WALDEC_ROW, importedAt);
  assert.equal(rejected, false);
  assert.ok(association);
  assert.equal(association!.rnaId, "W303000001");
  assert.equal(association!.legacyId, "0301000001");
  assert.equal(association!.title, "Mémoire de l'Aigoual");
  assert.equal(association!.shortTitle, "MEMOIRE AIGOUAL");
  assert.equal(association!.administrativeStatus, "active");
  assert.equal(association!.creationDate, "2004-02-19");
  assert.equal(association!.declarationDate, "2016-12-07");
  assert.equal(association!.dissolutionDate, null);
  assert.equal(association!.website, "https://example.test");
  assert.equal(association!.address.sourceCommuneCode, "30339");
  assert.equal(association!.address.normalizedCommuneCode, "30339");
  assert.equal(association!.address.municipalityName, "VALLERAUGUE");
  assert.equal(
    association!.address.label,
    "1 rue de la Mairie, 30570, VALLERAUGUE",
  );
  assert.equal(association!.source.sourceUpdatedAt, "2021-08-06T15:57:08");
});

test("adapte une ligne Import vers le contrat public (legacyId)", () => {
  const { association, rejected } = adaptImportRow(IMPORT_ROW, importedAt);
  assert.equal(rejected, false);
  assert.ok(association);
  assert.equal(association!.rnaId, null);
  assert.equal(association!.legacyId, "0031900001");
  assert.equal(association!.administrativeStatus, "dissolved");
  assert.equal(association!.address.sourceCommuneCode, null);
  assert.equal(association!.address.normalizedCommuneCode, "30339");
  assert.equal(
    association!.address.label,
    "Salle des fêtes, 30570, NOTRE-DAME-DE-LA-ROUVIERE",
  );
});

test("rejette une ligne sans titre ou sans identifiant", () => {
  const { association: noTitle, rejected: r1 } = adaptWaldecRow(
    { ...WALDEC_ROW, titre: "" },
    importedAt,
  );
  assert.equal(r1, true);
  assert.equal(noTitle, null);
  const { association: noId, rejected: r2 } = adaptWaldecRow(
    { ...WALDEC_ROW, id: "" },
    importedAt,
  );
  assert.equal(r2, true);
  assert.equal(noId, null);
});

test("rejette une ligne hors périmètre communal", () => {
  const { rejected } = adaptWaldecRow(
    { ...WALDEC_ROW, adrs_codeinsee: "30000", adrs_libcommune: "NIMES" },
    importedAt,
  );
  assert.equal(rejected, true);
});

test("interprète les statuts A, D et inconnu", () => {
  assert.equal(normalizeStatus("A"), "active");
  assert.equal(normalizeStatus("D"), "dissolved");
  assert.equal(normalizeStatus("X"), "unknown");
  assert.equal(normalizeStatus(undefined), "unknown");
  assert.equal(normalizeStatus(""), "unknown");
  // On ne transforme jamais une valeur inconnue en active.
  assert.notEqual(normalizeStatus("Z"), "active");
});

test("consolide les codes 30339, 30190 et les noms historiques", () => {
  assert.equal(normalizeCommune("30339", "VALLERAUGUE"), "30339");
  assert.equal(normalizeCommune("30190", "NOTRE-DAME-DE-LA-ROUVIERE"), "30339");
  assert.equal(normalizeCommune("30339", "VAL-D'AIGOUAL"), "30339");
  assert.equal(normalizeCommune("30000", "NIMES"), null);
  // Insensible aux accents, apostrophes, casse et espaces.
  assert.equal(
    normalizeCommune("30190", "notre dame de la rouvière"),
    "30339",
  );
});

test("valide les dates, y compris la sentinelle 0001-01-01", () => {
  assert.equal(validDate("2026-01-01"), "2026-01-01");
  assert.equal(validDate("0001-01-01"), null);
  assert.equal(validDate("2026-99-01"), null);
  assert.equal(validTimestamp("2021-08-06 15:57:08"), "2021-08-06T15:57:08");
  assert.equal(validTimestamp("0001-01-01 00:00:00"), null);
  assert.equal(normalizedText("Mémoire d'Aigoual"), "MEMOIRE D AIGOUAL");
});
