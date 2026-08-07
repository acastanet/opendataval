export interface CacheMemoire<T> {
  obtenir(cle: string): T | undefined;
  definir(cle: string, valeur: T): void;
}

/**
 * Cache mémoire à éviction FIFO, borné en taille et en durée de vie. Volontairement
 * non bloquant côté appelant : une entrée absente ou expirée ne fait jamais échouer la
 * requête, elle déclenche simplement un nouvel appel BRGM.
 */
export function createCacheMemoire<T>(
  ttlSecondes: number,
  maxEntrees: number,
  maintenant: () => number = Date.now,
): CacheMemoire<T> {
  const entrees = new Map<string, { valeur: T; expiration: number }>();

  return {
    obtenir(cle) {
      const entree = entrees.get(cle);
      if (!entree) return undefined;
      if (entree.expiration < maintenant()) {
        entrees.delete(cle);
        return undefined;
      }
      return entree.valeur;
    },
    definir(cle, valeur) {
      if (!entrees.has(cle) && entrees.size >= maxEntrees) {
        const plusAncienne = entrees.keys().next().value;
        if (plusAncienne !== undefined) entrees.delete(plusAncienne);
      }
      entrees.set(cle, { valeur, expiration: maintenant() + ttlSecondes * 1000 });
    },
  };
}

/** Clé de cache : coordonnées arrondies au 1/10 000° (~11 m) et rayon exact. */
export function cleCacheBrgm(lat: number, lon: number, rayonM: number): string {
  return `${lat.toFixed(4)}:${lon.toFixed(4)}:${rayonM}`;
}
