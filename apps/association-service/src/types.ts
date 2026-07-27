export type AdministrativeStatus = "active" | "dissolved" | "unknown";
export type GeocodingPrecision = "address" | "street" | "municipality";

export interface AssociationSummary {
  rnaId: string | null;
  legacyId: string | null;
  title: string;
  shortTitle: string | null;
  purpose: string | null;
  categoryPrimary: string | null;
  categorySecondary: string | null;
  administrativeStatus: AdministrativeStatus;
  creationDate: string | null;
  declarationDate: string | null;
  dissolutionDate: string | null;
  website: string | null;
  siren: string | null;
  siret: string | null;
  address: {
    label: string | null;
    street: string | null;
    postalCode: string | null;
    municipalityName: string;
    sourceCommuneCode: string | null;
    normalizedCommuneCode: string;
  };
  location: {
    latitude: number;
    longitude: number;
    precision: GeocodingPrecision;
    score: number | null;
  } | null;
  source: { name: "RNA"; sourceUpdatedAt: string | null; importedAt: string };
}

export type RnaSourceKind = "waldec" | "import";

export interface SourceProvenance {
  kind: RnaSourceKind;
  url: string | null;
  httpStatus: number | null;
  contentType: string | null;
  sha256: string;
  bytes: number;
  sourceUpdatedAt: string | null;
  rowsRead: number;
  rowsKept: number;
  rowsRejected: number;
  fetchedAt: string;
}

export interface AssociationManifest {
  schemaVersion: 1;
  generatedAt: string;
  sources: SourceProvenance[];
  totalRowsRead: number;
  totalRowsKept: number;
  totalRowsRejected: number;
  // Champs conservés pour la rétrocompatibilité de lecture des anciens
  // snapshots mono-source (cf. store.ts -> normalizeManifest).
  sourceUrl?: string;
  sha256?: string;
  sourceUpdatedAt?: string | null;
  rowCount?: number;
}

export interface Snapshot {
  schemaVersion: 1;
  associations: AssociationSummary[];
  manifest: AssociationManifest;
}
