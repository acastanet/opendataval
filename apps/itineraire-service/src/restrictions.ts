import { readFile } from "node:fs/promises";
import type { Restriction } from "./types.js";

export type RestrictionsIndex = Map<string, Restriction>;

export async function loadRestrictions(path: string): Promise<RestrictionsIndex> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as Record<string, Omit<Restriction, "wayId">>;
    return new Map(Object.entries(data).map(([wayId, value]) => [wayId, { wayId, ...value }]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
}

export function restrictionFor(index: RestrictionsIndex, wayId: string): Restriction | undefined {
  return index.get(wayId);
}
