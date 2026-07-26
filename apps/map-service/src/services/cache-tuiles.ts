export interface EntreeCache {
  data: Buffer;
  contentType: string;
  cacheControl: string;
}

interface Interne extends EntreeCache { taille: number }

export class CacheTuiles {
  private readonly entrees = new Map<string, Interne>();
  private octets = 0;

  constructor(private readonly maxOctets: number) {}

  get(cle: string): EntreeCache | undefined {
    const entree = this.entrees.get(cle);
    if (!entree) return undefined;
    this.entrees.delete(cle);
    this.entrees.set(cle, entree);
    return entree;
  }

  set(cle: string, entree: EntreeCache): void {
    const ancienne = this.entrees.get(cle);
    if (ancienne) this.octets -= ancienne.taille;
    const interne: Interne = { ...entree, taille: entree.data.byteLength };
    this.entrees.delete(cle);
    if (interne.taille > this.maxOctets) return;
    this.entrees.set(cle, interne);
    this.octets += interne.taille;
    while (this.octets > this.maxOctets) {
      const premiere = this.entrees.entries().next().value as [string, Interne] | undefined;
      if (!premiere) break;
      this.entrees.delete(premiere[0]);
      this.octets -= premiere[1].taille;
    }
  }

  stats(): { entrees: number; octets: number; maxOctets: number } {
    return { entrees: this.entrees.size, octets: this.octets, maxOctets: this.maxOctets };
  }
}
