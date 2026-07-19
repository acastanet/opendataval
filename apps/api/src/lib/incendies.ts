export type EtatFraicheur = "fraiche" | "ancienne" | "indisponible";

export interface FraicheurSource {
  etat: EtatFraicheur;
  age_minutes: number | null;
}

/**
 * Applique les seuils fonctionnels du MVP : fraîche avant 60 minutes,
 * ancienne jusqu'à 6 heures, puis indisponible.
 */
export function evaluerFraicheurFirms(
  derniereCollecte: string | Date | null,
  maintenant = Date.now(),
): FraicheurSource {
  if (derniereCollecte === null) return { etat: "indisponible", age_minutes: null };
  const collecte = new Date(derniereCollecte).getTime();
  if (!Number.isFinite(collecte)) return { etat: "indisponible", age_minutes: null };
  const ageMinutes = Math.max(0, Math.floor((maintenant - collecte) / 60_000));
  if (ageMinutes < 60) return { etat: "fraiche", age_minutes: ageMinutes };
  if (ageMinutes <= 360) return { etat: "ancienne", age_minutes: ageMinutes };
  return { etat: "indisponible", age_minutes: ageMinutes };
}

/** Retourne une date civile parisienne sans dérive lors des changements d'heure. */
export function dateParis(decalageJours = 0, maintenant = new Date()): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(maintenant);
  const valeur = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(valeur("year"), valeur("month") - 1, valeur("day") + decalageJours));
  return date.toISOString().slice(0, 10);
}

export function cleDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const correspondance = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return correspondance?.[0] ?? "";
}

export function parseHours(value: string | undefined): number | null {
  if (value === undefined) return 24;
  if (!/^\d+$/.test(value)) return null;
  const hours = Number(value);
  return Number.isInteger(hours) && hours >= 1 && hours <= 72 ? hours : null;
}
