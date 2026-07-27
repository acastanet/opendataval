import type { AssociationConfig } from "./config.js";
import type {
  AssociationSummary,
  RnaSourceKind,
  Snapshot,
  SourceProvenance,
} from "./types.js";
import type { SnapshotStore } from "./store.js";
import { streamParseCsv } from "./csv.js";
import { downloadStream } from "./download.js";
import {
  adaptImportRow,
  adaptWaldecRow,
  importRequiredColumns,
  waldecRequiredColumns,
} from "./adapters.js";
import {
  geocode,
  loadGeocodingCache,
  saveGeocodingCache,
} from "./geocode.js";
import type { CsvRecord } from "./adapters.js";

const MUNICIPALITY_CODE = "30339";

interface SourceOutcome {
  kind: RnaSourceKind;
  url: string | null;
  provenance: SourceProvenance;
  associations: AssociationSummary[];
}

async function fetchSource(
  config: AssociationConfig,
  url: string,
  kind: RnaSourceKind,
  requiredColumns: string[],
  adapter: (record: CsvRecord, importedAt: string) => {
    association: AssociationSummary | null;
    rejected: boolean;
  },
  importedAt: string,
  fetchImpl: typeof fetch,
): Promise<SourceOutcome> {
  const downloaded = await downloadStream(url, {
    timeoutMs: config.downloadTimeoutMs,
    fetchImpl,
  });
  const collected: AssociationSummary[] = [];
  let rowsRead = 0;
  let rowsKept = 0;
  let rowsRejected = 0;
  const result = await streamParseCsv(downloaded.body, {
    requiredColumns,
    signal: AbortSignal.timeout(config.downloadTimeoutMs),
    maxBytes: 2_000_000_000,
    onRecord: (record: CsvRecord) => {
      rowsRead += 1;
      const { association, rejected } = adapter(record, importedAt);
      if (rejected || !association) {
        rowsRejected += 1;
        return;
      }
      rowsKept += 1;
      collected.push(association);
    },
  });
  const provenance: SourceProvenance = {
    kind,
    url,
    httpStatus: downloaded.status,
    contentType: downloaded.contentType,
    sha256: result.sha256,
    bytes: result.bytes,
    sourceUpdatedAt: null,
    rowsRead,
    rowsKept,
    rowsRejected,
    fetchedAt: new Date().toISOString(),
  };
  return { kind, url, provenance, associations: collected };
}

/**
 * Fusionne et déduplique les deux extractions. Priorité de déduplication :
 * 1. numéro RNA officiel (`rnaId`) ;
 * 2. identifiant historique Import (`legacyId`).
 * On ne fusionne jamais deux associations sur leur seul titre. Waldec prime
 * sur Import en cas de doublon.
 */
function mergeAndDeduplicate(
  waldec: AssociationSummary[],
  imported: AssociationSummary[],
): AssociationSummary[] {
  const associations: AssociationSummary[] = [];
  const officialIds = new Set<string>();
  const legacyIds = new Set<string>();
  const push = (association: AssociationSummary) => {
    if (
      (association.rnaId && officialIds.has(association.rnaId)) ||
      (association.legacyId && legacyIds.has(association.legacyId))
    ) {
      return;
    }
    associations.push(association);
    if (association.rnaId) officialIds.add(association.rnaId);
    if (association.legacyId) legacyIds.add(association.legacyId);
  };
  // Waldec en premier : il prime en cas de doublon.
  for (const association of waldec) push(association);
  for (const association of imported) push(association);
  return associations;
}

export class RnaSynchronizationError extends Error {
  constructor(
    message: string,
    readonly failedSource: RnaSourceKind | "snapshot",
  ) {
    super(message);
    this.name = "RnaSynchronizationError";
  }
}

/**
 * Synchronise les deux extractions officielles Waldec et Import.
 *
 * Politique atomique « tout ou rien » : les deux sources doivent être
 * téléchargées, validées et transformées. Si l'une échoue, une erreur est
 * levée et le snapshot courant reste inchangé (géré par l'appelant qui ne
 * remplace pas le store). Un résultat combiné vide est invalide.
 */
export async function synchronizeRna(
  config: AssociationConfig,
  store: SnapshotStore,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const usesNationalSources =
    config.waldecSourceUrl !== undefined ||
    config.importSourceUrl !== undefined;
  if (
    usesNationalSources &&
    (!config.waldecSourceUrl || !config.importSourceUrl)
  ) {
    throw new RnaSynchronizationError(
      "RNA_WALDEC_SOURCE_URL et RNA_IMPORT_SOURCE_URL doivent être configurées ensemble",
      "snapshot",
    );
  }
  const waldecUrl = usesNationalSources
    ? config.waldecSourceUrl
    : config.rnaSourceUrl;
  const importUrl = usesNationalSources
    ? config.importSourceUrl
    : undefined;
  if (!waldecUrl)
    throw new RnaSynchronizationError(
      "RNA_WALDEC_SOURCE_URL et RNA_IMPORT_SOURCE_URL, ou l'ancienne RNA_SOURCE_URL, sont requises pour synchroniser",
      "snapshot",
    );

  const importedAt = new Date().toISOString();
  const outcomes: SourceOutcome[] = [];

  try {
    outcomes.push(
      await fetchSource(
        config,
        waldecUrl,
        "waldec",
        waldecRequiredColumns(),
        adaptWaldecRow,
        importedAt,
        fetchImpl,
      ),
    );
    if (importUrl) {
      outcomes.push(
        await fetchSource(
          config,
          importUrl,
          "import",
          importRequiredColumns(),
          adaptImportRow,
          importedAt,
          fetchImpl,
        ),
      );
    }
  } catch (error) {
    const source =
      error instanceof RnaSynchronizationError
        ? error.failedSource
        : (outcomes.at(-1)?.kind ?? "snapshot");
    throw new RnaSynchronizationError(
      `Échec de la source ${(error as Error).message ?? error}`,
      source as RnaSourceKind,
    );
  }

  const waldecAssociations =
    outcomes.find((outcome) => outcome.kind === "waldec")?.associations ?? [];
  const importAssociations =
    outcomes.find((outcome) => outcome.kind === "import")?.associations ?? [];
  const associations = mergeAndDeduplicate(
    waldecAssociations,
    importAssociations,
  );

  if (associations.length === 0) {
    throw new RnaSynchronizationError(
      "Les extractions RNA ne contiennent aucune association de Val-d'Aigoual",
      "snapshot",
    );
  }

  const cache = await loadGeocodingCache(config);
  for (const association of associations) {
    await geocode(association, cache, config, fetchImpl);
  }
  await saveGeocodingCache(config, cache);

  const totalRowsRead = outcomes.reduce(
    (sum, outcome) => sum + outcome.provenance.rowsRead,
    0,
  );
  const totalRowsKept = outcomes.reduce(
    (sum, outcome) => sum + outcome.provenance.rowsKept,
    0,
  );
  const totalRowsRejected = outcomes.reduce(
    (sum, outcome) => sum + outcome.provenance.rowsRejected,
    0,
  );

  const snapshot: Snapshot = {
    schemaVersion: 1,
    associations,
    manifest: {
      schemaVersion: 1,
      generatedAt: importedAt,
      sources: outcomes.map((outcome) => outcome.provenance),
      totalRowsRead,
      totalRowsKept,
      totalRowsRejected,
    },
  };

  await store.replace(snapshot);
}
