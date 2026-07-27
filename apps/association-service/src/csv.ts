import { createHash, type Hash } from "node:crypto";
import { Readable } from "node:stream";
import { type ReadableStream as NodeReadableStream } from "node:stream/web";
import { Transform, type TransformCallback } from "node:stream";
import { Parser } from "csv-parse";

type CsvRecord = Record<string, string>;

export interface StreamParseOptions {
  /** Appelée pour chaque ligne (en-tête exclu). */
  onRecord: (record: CsvRecord) => void;
  /** Colonnes obligatoires : une absence lève une erreur avant tout traitement. */
  requiredColumns: string[];
  /** AbortSignal de délai réseau ; détruit les flux à l'expiration. */
  signal?: AbortSignal;
  /** Taille maximale en octets ; au-delà, le flux est interrompu. 0 = sans limite. */
  maxBytes?: number;
}

export interface StreamParseResult {
  sha256: string;
  bytes: number;
  rowsRead: number;
}

/**
 * Transform qui met à jour un hachage SHA-256 et compte les octets lus, tout en
 * imposant une limite de taille pour ne jamais accepter un fichier déraisonnable
 * en mémoire de transit.
 */
class ByteTap extends Transform {
  readonly hash: Hash;
  bytes = 0;
  private readonly maxBytes: number;
  constructor(hash: Hash, maxBytes: number) {
    super();
    this.hash = hash;
    this.maxBytes = maxBytes;
  }
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    if (this.maxBytes > 0 && this.bytes > this.maxBytes) {
      callback(
        new Error(
          `Téléchargement CSV trop volumineux (seuil ${(this.maxBytes / 1e6).toFixed(0)} Mo)`,
        ),
      );
      return;
    }
    callback(null, chunk);
  }
}

function validateHeader(record: CsvRecord, required: string[]): void {
  const present = new Set(Object.keys(record));
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0)
    throw new Error(
      `En-tête CSV invalide : colonnes obligatoires manquantes (${missing.join(", ")})`,
    );
}

/**
 * Parse un flux CSV national ligne par ligne (aucun fichier complet en mémoire).
 * Gère BOM, CRLF/Unix, guillemets, guillemets échappés et retours à la ligne
 * dans un champ via csv-parse. Renvoie le SHA-256, le nombre d'octets et le
 * nombre de lignes lues.
 */
export async function streamParseCsv(
  body: NodeReadableStream<Uint8Array> | null,
  options: StreamParseOptions,
): Promise<StreamParseResult> {
  if (!body) throw new Error("Corps de réponse CSV absent");
  const hash = createHash("sha256");
  const tap = new ByteTap(hash, options.maxBytes ?? 0);
  const parser = new Parser({
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    encoding: "utf8",
  });

  let rowsRead = 0;
  let headerValidated = false;
  const collectedErrors: Error[] = [];

  parser.on("readable", () => {
    let record: CsvRecord | null;
    while ((record = parser.read() as CsvRecord | null) !== null) {
      try {
        if (!headerValidated) {
          validateHeader(record, options.requiredColumns);
          headerValidated = true;
        }
      } catch (error) {
        collectedErrors.push(error as Error);
        parser.destroy(error as Error);
        return;
      }
      rowsRead += 1;
      options.onRecord(record);
    }
  });

  const finished = new Promise<void>((resolve, reject) => {
    parser.on("end", () => resolve());
    parser.on("error", (error: Error) => reject(error));
    tap.on("error", (error: Error) => reject(error));
  });

  if (options.signal) {
    options.signal.addEventListener(
      "abort",
      () => {
        const error = new Error("Délai de téléchargement CSV dépassé");
        parser.destroy(error);
        tap.destroy(error);
      },
      { once: true },
    );
  }

  const nodeStream = Readable.fromWeb(
    body as NodeReadableStream<Uint8Array>,
  );
  nodeStream.pipe(tap).pipe(parser);
  try {
    await finished;
  } catch (error) {
    if (collectedErrors.length > 0) throw collectedErrors[0];
    throw error;
  }
  return { sha256: hash.digest("hex"), bytes: tap.bytes, rowsRead };
}
