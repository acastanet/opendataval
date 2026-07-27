import type { AdministrativeStatus } from "./types.js";

export const VAL_D_AIGOUAL_ALIASES = [
  { sourceCode: "30339", sourceName: "VAL-D'AIGOUAL", normalizedCode: "30339" },
  { sourceCode: "30339", sourceName: "VALLERAUGUE", normalizedCode: "30339" },
  {
    sourceCode: "30190",
    sourceName: "NOTRE-DAME-DE-LA-ROUVIERE",
    normalizedCode: "30339",
  },
] as const;

const NORMALIZED_CODE = "30339";

/**
 * Normalise une chaîne pour la comparaison insensible :
 * - suppression des accents (NFD) ;
 * - apostrophes droites et typographiques normalisées ;
 * - espaces réduits à un seul, en capitales.
 */
export function normalizedText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Retourne le code INSEE normalisé de Val-d'Aigoual (30339) si la ligne est
 * rattachable à la commune, sinon `null`.
 */
export function normalizeCommune(
  code: string | null | undefined,
  name: string | null | undefined,
): string | null {
  const normalizedName = normalizedText(name);
  const matches = VAL_D_AIGOUAL_ALIASES.some(
    (alias) =>
      alias.sourceCode === (code ?? "").trim() ||
      normalizedText(alias.sourceName) === normalizedName,
  );
  return matches ? NORMALIZED_CODE : null;
}

/**
 * Interprète le statut administratif RNA.
 * Valeurs officielles connues : `A` (active), `D` (dissoute).
 * Toute autre valeur (absente, inconnue, ou hors nomenclature) devient
 * `unknown` : on ne transforme jamais une valeur inconnue en `active`.
 */
export function normalizeStatus(
  value: string | null | undefined,
): AdministrativeStatus {
  const text = normalizedText(value);
  if (text === "A" || text === "ACTIF" || text === "ACTIVE" || text === "EN ACTIVITE")
    return "active";
  if (
    text === "D" ||
    text === "DISSOU" ||
    text === "DISSOUTE" ||
    text === "SUPPRIM" ||
    text === "RADIE"
  )
    return "dissolved";
  return "unknown";
}

/**
 * Valide une date ISO `AAAA-MM-JJ`. Les dates sentinelles du RNA
 * (`0001-01-01`, « date invalide ») sont rejetées : elles ne portent aucune
 * information réelle et ne doivent pas apparaître comme date de création.
 */
export function validDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value === "0001-01-01") return null;
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return null;
  return value;
}

/**
 * Valide une date ou un horodatage RNA. Accepte `AAAA-MM-JJ` et
 * `AAAA-MM-JJ HH:MM:SS` (format `maj_time`). Les dates sentinelles
 * (`0001-01-01`) sont rejetées. Renvoie une chaîne ISO ou `null`.
 */
export function validTimestamp(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return validDate(trimmed);
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(trimmed);
  if (match) {
    if (validDate(match[1]) === null) return null;
    const iso = `${match[1]}T${match[2]}`;
    if (Number.isNaN(Date.parse(iso))) return null;
    return iso;
  }
  return null;
}
