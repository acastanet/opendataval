const FUSEAU = "Europe/Paris";

export function jourClimatologique(date = new Date()): number {
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat("fr-CA", {
      timeZone: FUSEAU,
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).map(({ type, value }) => [type, value]),
  ) as Record<string, string>;
  const mois = Number(parties.month);
  const jour = Number(parties.day);
  const canonique = Date.UTC(2000, mois - 1, jour);
  return Math.floor((canonique - Date.UTC(2000, 0, 1)) / 86_400_000) + 1;
}

export function nombreOuNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function datesIso(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string" && value.startsWith("{") && value.endsWith("}")
      ? value.slice(1, -1).split(",").filter(Boolean)
      : [];
  return values
    .map((item) => item instanceof Date ? item.toISOString().slice(0, 10) : String(item).slice(0, 10))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
}

export function periodeMensuelle(annee: number, mois: number): { debut: string; fin: string } {
  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const dernierJour = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return { debut, fin: `${annee}-${String(mois).padStart(2, "0")}-${dernierJour}` };
}
