interface Compteur {
  hits: number;
  miss: number;
  erreursAmont: number;
  octetsServis: number;
  dureesMs: number[];
}

export class MetriquesMap {
  private readonly compteurs = new Map<string, Compteur>();

  private compteur(famille: string): Compteur {
    let compteur = this.compteurs.get(famille);
    if (!compteur) {
      compteur = { hits: 0, miss: 0, erreursAmont: 0, octetsServis: 0, dureesMs: [] };
      this.compteurs.set(famille, compteur);
    }
    return compteur;
  }

  hit(famille: string, octets: number, dureeMs: number): void { const c = this.compteur(famille); c.hits += 1; c.octetsServis += octets; this.duree(c, dureeMs); }
  miss(famille: string, octets: number, dureeMs: number): void { const c = this.compteur(famille); c.miss += 1; c.octetsServis += octets; this.duree(c, dureeMs); }
  erreur(famille: string, dureeMs: number): void { const c = this.compteur(famille); c.erreursAmont += 1; this.duree(c, dureeMs); }

  private duree(compteur: Compteur, dureeMs: number): void {
    compteur.dureesMs.push(dureeMs);
    if (compteur.dureesMs.length > 500) compteur.dureesMs.splice(0, compteur.dureesMs.length - 500);
  }

  snapshot(): { famille: string; hits: number; miss: number; erreursAmont: number; octetsServis: number; p95Ms: number }[] {
    return [...this.compteurs.entries()].map(([famille, c]) => {
      const triees = [...c.dureesMs].sort((a, b) => a - b);
      const p95Ms = triees.length === 0 ? 0 : triees[Math.min(triees.length - 1, Math.floor(triees.length * 0.95))];
      return { famille, hits: c.hits, miss: c.miss, erreursAmont: c.erreursAmont, octetsServis: c.octetsServis, p95Ms };
    });
  }
}
