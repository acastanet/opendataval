import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { VigilanceSnapshot } from "./types.js";

export class SnapshotStore {
  constructor(private readonly path: string) {}
  async load(): Promise<VigilanceSnapshot | null> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as VigilanceSnapshot;
      if (parsed.schemaVersion !== 1 || !parsed.retrievedAt || !parsed.departments) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  async save(snapshot: VigilanceSnapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }
}
