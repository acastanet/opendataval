import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import type { AssociationManifest, Snapshot } from "./types.js";

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return false;
  if (!Array.isArray(candidate.associations)) return false;
  if (typeof candidate.manifest !== "object" || candidate.manifest === null)
    return false;
  return true;
}

/**
 * Normalise un manifeste lu depuis un snapshot, y compris les anciens
 * snapshots mono-source produits avant la politique atomique à deux sources.
 * Garantit la présence du tableau `sources`.
 */
export function normalizeManifest(
  manifest: Record<string, unknown>,
): AssociationManifest {
  const sources = Array.isArray(manifest.sources)
    ? (manifest.sources as AssociationManifest["sources"])
    : [];
  if (sources.length === 0) {
    // Ancien format : un seul bloc de provenance.
    sources.push({
      kind: "waldec",
      url: (manifest.sourceUrl as string | null) ?? null,
      httpStatus: null,
      contentType: null,
      sha256: (manifest.sha256 as string) ?? "",
      bytes: 0,
      sourceUpdatedAt:
        (manifest.sourceUpdatedAt as string | null) ?? null,
      rowsRead: 0,
      rowsKept: (manifest.rowCount as number) ?? 0,
      rowsRejected: 0,
      fetchedAt: (manifest.generatedAt as string) ?? new Date(0).toISOString(),
    });
  }
  return {
    schemaVersion: 1,
    generatedAt:
      (manifest.generatedAt as string) ?? new Date(0).toISOString(),
    sources,
    totalRowsRead:
      (manifest.totalRowsRead as number) ??
      sources.reduce((sum, source) => sum + source.rowsRead, 0),
    totalRowsKept:
      (manifest.totalRowsKept as number) ??
      sources.reduce((sum, source) => sum + source.rowsKept, 0),
    totalRowsRejected:
      (manifest.totalRowsRejected as number) ??
      sources.reduce((sum, source) => sum + source.rowsRejected, 0),
    sourceUrl: manifest.sourceUrl as string | undefined,
    sha256: manifest.sha256 as string | undefined,
    sourceUpdatedAt: manifest.sourceUpdatedAt as string | null | undefined,
    rowCount: manifest.rowCount as number | undefined,
  };
}

export class SnapshotStore {
  private snapshot: Snapshot | null = null;
  constructor(private readonly path: string) {}

  async restore(): Promise<Snapshot | null> {
    try {
      const raw = gunzipSync(await readFile(this.path)).toString("utf8");
      const value: unknown = JSON.parse(raw);
      if (!isSnapshot(value)) throw new Error("Snapshot invalide");
      value.manifest = normalizeManifest(
        value.manifest as unknown as Record<string, unknown>,
      );
      this.snapshot = value;
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  current(): Snapshot | null {
    return this.snapshot;
  }

  /**
   * Remplace atomiquement le snapshot. Un résultat combiné vide est invalide :
   * on refuse de l'écrire, ce qui laisse le snapshot précédent intact.
   */
  async replace(snapshot: Snapshot): Promise<void> {
    if (!isSnapshot(snapshot) || snapshot.associations.length === 0)
      throw new Error("Snapshot vide ou incomplet");
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, gzipSync(JSON.stringify(snapshot)));
    await rename(temporary, this.path);
    this.snapshot = snapshot;
  }
}
