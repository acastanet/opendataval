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

/** Chemins des deux archives d'une région, telles que résolues par la configuration. */
export interface CheminsRegionRelief {
  id: string;
  /** `[lonMin, latMin, lonMax, latMax]` */
  bounds: readonly [number, number, number, number];
  globalPath: string;
  hdPath: string;
}

interface ArchivesRegion {
  id: string;
  sourceGlobale: SourceFichier;
  sourceHd: SourceFichier;
  globale: PMTiles;
  hd: PMTiles;
  globalPath: string;
  hdPath: string;
  disponible: boolean;
}

/**
 * Lit les archives PMTiles de relief de plusieurs régions géographiques.
 *
 * `getTile` interroge les archives montées et laisse PMTiles répondre, sans présélectionner
 * de région d'après les `bounds` de `REGIONS_RELIEF` : **l'ensemble des tuiles stockées
 * déborde de la bbox de la région**. Une archive contient toute tuile qui *intersecte* la
 * zone, or une tuile de bas zoom est bien plus large qu'elle — mesuré sur `aigoual.pmtiles`
 * (bbox 3,2/43,8 → 4,1/44,4), `7/65/46` est servie avec 443 Ko de relief alors que son
 * centre tombe à 4,22° E, hors de la bbox, et `0/0/0` l'est aussi. Filtrer sur la position
 * de la tuile perdrait donc des données réellement présentes.
 *
 * La géographie ne tranche pas davantage 404 contre 503 : une tuile qu'aucune archive montée
 * ne sert est une absence de relief ordinaire (404). Seule l'absence **totale** d'archive est
 * une panne (503, `RELIEF_INDISPONIBLE`) — sans quoi une région déclarée mais pas encore
 * générée transformerait en panne les tuiles que l'archive d'une autre région couvre déjà.
 */
export class ReliefPmtiles {
  private readonly regions: ArchivesRegion[];

  constructor(regions: readonly CheminsRegionRelief[]) {
    const cache = new SharedPromiseCache(100);
    this.regions = regions.map((region) => {
      const sourceGlobale = new SourceFichier(region.globalPath);
      const sourceHd = new SourceFichier(region.hdPath);
      return {
        id: region.id,
        sourceGlobale,
        sourceHd,
        globale: new PMTiles(sourceGlobale, cache),
        hd: new PMTiles(sourceHd, cache),
        globalPath: region.globalPath,
        hdPath: region.hdPath,
        disponible: false,
      };
    });
  }

  async initialiser(): Promise<void> {
    await Promise.all(
      this.regions.map(async (region) => {
        try {
          await Promise.all([access(region.globalPath), access(region.hdPath)]);
          region.disponible = true;
        } catch {
          region.disponible = false;
        }
      }),
    );
  }

  /**
   * `disponible` dès qu'une région au moins est montée, car le service rend alors du relief.
   *
   * Exiger que **toutes** les régions le soient bloquerait `/ready` en `degraded` de façon
   * permanente : `REGIONS_RELIEF` déclare des régions dont les archives restent à générer, un
   * chantier planifié et non une panne. Un signal figé ne signalerait plus rien le jour d'une
   * vraie indisponibilité — c'est `detailRegions()` qui porte la visibilité région par région.
   */
  status(): "disponible" | "indisponible" {
    return this.regions.some((region) => region.disponible) ? "disponible" : "indisponible";
  }

  /** État de chaque région, pour que `/ready` expose ce qui manque sans dégrader le service. */
  detailRegions(): Record<string, "disponible" | "indisponible"> {
    return Object.fromEntries(this.regions.map((region) => [region.id, region.disponible ? "disponible" : "indisponible"]));
  }

  async getTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<ArrayBuffer | undefined> {
    let uneRegionDisponible = false;
    for (const region of this.regions) {
      if (!region.disponible) continue;
      uneRegionDisponible = true;
      const archive = z >= RELIEF_HD_MINZOOM ? region.hd : region.globale;
      const tuile = await archive.getZxy(z, x, y, signal);
      if (tuile) return tuile.data;
    }
    if (!uneRegionDisponible && this.regions.length > 0) throw new Error("RELIEF_INDISPONIBLE");
    return undefined;
  }

  async close(): Promise<void> {
    await Promise.all(this.regions.flatMap((region) => [region.sourceGlobale.close(), region.sourceHd.close()]));
  }
}
