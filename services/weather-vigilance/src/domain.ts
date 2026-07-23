import type { Level, VigilanceLevelCode } from "./types.js";

const LEVEL_BY_SOURCE: Record<string, { code: VigilanceLevelCode; rank: number; label: string }> = {
  "1": { code: "green", rank: 0, label: "Vigilance verte" },
  "2": { code: "yellow", rank: 1, label: "Vigilance jaune" },
  "3": { code: "orange", rank: 2, label: "Vigilance orange" },
  "4": { code: "red", rank: 3, label: "Vigilance rouge" },
  green: { code: "green", rank: 0, label: "Vigilance verte" },
  yellow: { code: "yellow", rank: 1, label: "Vigilance jaune" },
  orange: { code: "orange", rank: 2, label: "Vigilance orange" },
  red: { code: "red", rank: 3, label: "Vigilance rouge" },
};

export const PHENOMENA: Record<string, { code: string; label: string }> = {
  "1": { code: "wind", label: "Vent" },
  "2": { code: "rain_flood", label: "Pluie-inondation" },
  "3": { code: "thunderstorm", label: "Orages" },
  "4": { code: "flood", label: "Crues" },
  "5": { code: "snow_ice", label: "Neige-verglas" },
  "6": { code: "heatwave", label: "Canicule" },
  "7": { code: "extreme_cold", label: "Grand froid" },
  "8": { code: "avalanche", label: "Avalanches" },
  "9": { code: "waves_submersion", label: "Vagues-submersion" },
};

export function normalizeLevel(value: unknown): Level {
  const sourceCode = String(value ?? "").trim().toLowerCase();
  const known = LEVEL_BY_SOURCE[sourceCode];
  if (known) return { ...known, sourceCode };
  return { code: "unknown", rank: null, label: "Niveau inconnu", sourceCode };
}

export function maxLevel(levels: Level[]): Level {
  const known = levels.filter((level): level is Level & { rank: number } => level.rank !== null);
  return known.sort((a, b) => b.rank - a.rank)[0] ?? normalizeLevel("unknown");
}

export function normalizeDepartmentCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (/^(?:0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(normalized)) return normalized;
  return null;
}

export function iso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}
