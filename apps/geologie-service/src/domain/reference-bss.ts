/**
 * Format vérifié empiriquement contre les fiches réelles BRGM (ex. `09372X0012/MONNA`,
 * `09371X0028/VA-2A`) : 5 chiffres, 1 lettre, 4 chiffres, `/`, désignation libre.
 * Toute URL vers InfoTerre doit être reconstruite par le serveur à partir d'une référence
 * validée par cette regex — jamais acceptée telle quelle depuis le client (anti-SSRF).
 */
export const REGEX_REFERENCE_BSS = /^\d{5}[A-Z]\d{4}\/[A-Za-z0-9._-]{1,80}$/;

export function referenceValide(reference: string): boolean {
  return REGEX_REFERENCE_BSS.test(reference);
}

export function urlFicheInfoterre(reference: string): string {
  return `http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=${encodeURIComponent(reference)}`;
}
