import { access, open, type FileHandle } from "node:fs/promises";
import { PMTiles, SharedPromiseCache, type RangeResponse, type Source } from "pmtiles";
import { RELIEF_HD_MINZOOM } from "@opendata-vda/shared/carto";

class SourceFichier implements Source {
  private handle?: FileHandle;

  constructor(private readonly chemin: string) {}

  getKey(): string { return `file:${this.chemin}`; }

  private async ouvrir(): Promise<FileHandle> {
    this.handle ??= await open(this.chemin, "r");
    return this.handle;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    if (signal?.aborted) throw signal.reason ?? new Error("Lecture PMTiles annulée.");
    const handle = await this.ouvrir();
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (signal?.aborted) throw signal.reason ?? new Error("Lecture PMTiles annulée.");
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) as ArrayBuffer;
    return { data };
  }

  async close(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
  }
}

export class ReliefPmtiles {
  private readonly sourceGlobale: SourceFichier;
  private readonly sourceHd: SourceFichier;
  private readonly globale: PMTiles;
  private readonly hd: PMTiles;
  private disponible = false;

  constructor(globalPath: string, hdPath: string) {
    const cache = new SharedPromiseCache(100);
    this.sourceGlobale = new SourceFichier(globalPath);
    this.sourceHd = new SourceFichier(hdPath);
    this.globale = new PMTiles(this.sourceGlobale, cache);
    this.hd = new PMTiles(this.sourceHd, cache);
  }

  async initialiser(globalPath: string, hdPath: string): Promise<void> {
    try {
      await Promise.all([access(globalPath), access(hdPath)]);
      this.disponible = true;
    } catch {
      this.disponible = false;
    }
  }

  status(): "disponible" | "indisponible" { return this.disponible ? "disponible" : "indisponible"; }

  async getTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<ArrayBuffer | undefined> {
    if (!this.disponible) throw new Error("RELIEF_INDISPONIBLE");
    const archive = z >= RELIEF_HD_MINZOOM ? this.hd : this.globale;
    const tuile = await archive.getZxy(z, x, y, signal);
    return tuile?.data;
  }

  async close(): Promise<void> {
    await Promise.all([this.sourceGlobale.close(), this.sourceHd.close()]);
  }
}
