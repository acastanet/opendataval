import type { AssociationSummary } from "./types.js";
import {
  normalizeCommune,
  normalizeStatus,
  validDate,
  validTimestamp,
} from "./normalization.js";

export type CsvRecord = Record<string, string>;

export interface AdapterResult {
  association: AssociationSummary | null;
  rejected: boolean;
}

function first(
  record: CsvRecord,
  ...names: string[]
): string | null {
  for (const name of names) {
    const value = record[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

/** Assemble une adresse sans inventer d'information : ne conserve que les fragments non vides. */
function joinAddress(...parts: Array<string | null>): string | null {
  const cleaned = parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

/** Assemble les composants d'une voie avec des espaces, puis l'adresse avec des virgules. */
function joinStreet(...parts: Array<string | null>): string | null {
  const cleaned = parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
  return cleaned.length > 0 ? cleaned.join(" ") : null;
}

const WALDEC_REQUIRED = [
  "id",
  "titre",
  "adrs_codeinsee",
  "position",
];
const IMPORT_REQUIRED = [
  "id",
  "titre",
  "adrs_codepostal",
  "libcom",
  "position",
];

export function waldecRequiredColumns(): string[] {
  return [...WALDEC_REQUIRED];
}

export function importRequiredColumns(): string[] {
  return [...IMPORT_REQUIRED];
}

/**
 * Adaptateur Waldec : transforme une ligne du fichier national en
 * `AssociationSummary`. Aucune déduction de schéma : les colonnes sont
 * explicites. Une ligne sans identifiant RNA ni commune rattachable, ou sans
 * titre, est rejetée.
 */
export function adaptWaldecRow(
  record: CsvRecord,
  importedAt: string,
): AdapterResult {
  const sourceCommuneCode = first(record, "adrs_codeinsee");
  const municipalityName = first(record, "adrs_libcommune") ?? "";
  const normalizedCode = normalizeCommune(
    sourceCommuneCode,
    municipalityName,
  );
  const rnaId = first(record, "id");
  const title = first(record, "titre");
  if (!normalizedCode || !title || !rnaId) {
    return { association: null, rejected: true };
  }
  const street = joinStreet(
    first(record, "adrs_numvoie"),
    first(record, "adrs_repetition"),
    first(record, "adrs_typevoie"),
    first(record, "adrs_libvoie"),
  );
  const label = joinAddress(
    first(record, "adrs_complement"),
    street,
    first(record, "adrs_distrib"),
    first(record, "adrs_codepostal"),
    first(record, "adrs_libcommune"),
  );
  const association: AssociationSummary = {
    rnaId,
    legacyId: first(record, "id_ex"),
    title,
    shortTitle: first(record, "titre_court") ?? null,
    purpose: first(record, "objet"),
    categoryPrimary: first(record, "objet_social1"),
    categorySecondary: first(record, "objet_social2"),
    administrativeStatus: normalizeStatus(first(record, "position")),
    creationDate: validDate(first(record, "date_creat")),
    declarationDate: validDate(first(record, "date_decla")),
    dissolutionDate: validDate(first(record, "date_disso")),
    website: first(record, "siteweb") ?? null,
    siren: null,
    siret: first(record, "siret"),
    address: {
      label,
      street,
      postalCode: first(record, "adrs_codepostal"),
      municipalityName,
      sourceCommuneCode,
      normalizedCommuneCode: normalizedCode,
    },
    location: null,
    source: {
      name: "RNA",
      sourceUpdatedAt: validTimestamp(first(record, "maj_time")),
      importedAt,
    },
  };
  return { association, rejected: false };
}

/**
 * Adaptateur Import : transforme une ligne de l'extraction nationale.
 * `id` devient l'identifiant historique (`legacyId`), `libcom` le nom de
 * commune, `adr1`/`adr2`/`adr3` l'adresse. Mêmes règles de rejet que Waldec.
 */
export function adaptImportRow(
  record: CsvRecord,
  importedAt: string,
): AdapterResult {
  const sourceCommuneCode = first(record, "adrs_codeinsee");
  const municipalityName = first(record, "libcom") ?? "";
  const normalizedCode = normalizeCommune(
    sourceCommuneCode,
    municipalityName,
  );
  const legacyId = first(record, "id");
  const title = first(record, "titre");
  if (!normalizedCode || !title || !legacyId) {
    return { association: null, rejected: true };
  }
  const label = joinAddress(
    first(record, "adr1"),
    first(record, "adr2"),
    first(record, "adr3"),
    first(record, "adrs_codepostal"),
    first(record, "libcom"),
  );
  const association: AssociationSummary = {
    rnaId: null,
    legacyId,
    title,
    shortTitle: null,
    purpose: first(record, "objet"),
    categoryPrimary: first(record, "objet_social1"),
    categorySecondary: first(record, "objet_social2"),
    administrativeStatus: normalizeStatus(first(record, "position")),
    creationDate: validDate(first(record, "date_creat")),
    declarationDate: null,
    dissolutionDate: null,
    website: first(record, "siteweb") ?? null,
    siren: null,
    siret: first(record, "siret"),
    address: {
      label,
      street: null,
      postalCode: first(record, "adrs_codepostal"),
      municipalityName,
      sourceCommuneCode,
      normalizedCommuneCode: normalizedCode,
    },
    location: null,
    source: {
      name: "RNA",
      sourceUpdatedAt: validTimestamp(first(record, "maj_time")),
      importedAt,
    },
  };
  return { association, rejected: false };
}
