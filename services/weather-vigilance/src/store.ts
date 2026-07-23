import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { VigilanceConfig } from "./config.js";
import { parseBulletinProduct, parseMapProduct, type DepartmentSnapshot, type StructuredWarning, type VigilanceSnapshot } from "./domain.js";
import type { Metrics } from "./metrics.js";
import type { MeteoFranceClient } from "./source-client.js";

export type FreshnessStatus = "fresh" | "stale" | "expired" | "unknown";
export interface StoreStatus {
  freshness: FreshnessStatus;
  lastAttempt: string | null;
  lastSuccess: string | null;
  lastError: { code: string; message: string } | null;
  restored: boolean;
}

function errorCode(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "REFRESH_FAILED"; }

export class VigilanceStore {
  private snapshot: VigilanceSnapshot | null = null;
  private lastAttempt: string | null = null;
  private lastSuccess: string | null = null;
  private lastError: { code: string; message: string } | null = null;
  private restored = false;
  private refreshing: Promise<boolean> | null = null;
  constructor(private config: VigilanceConfig, private client: MeteoFranceClient, private metrics: Metrics, private now: () => Date = () => new Date()) {}

  async restore(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.config.snapshotPath, "utf8")) as VigilanceSnapshot;
      if (parsed.schema_version !== 1 || !parsed.retrieved_at || !parsed.departments) throw new Error("snapshot invalide");
      this.snapshot = parsed; this.lastSuccess = parsed.retrieved_at; this.restored = true;
      this.updateMetrics();
    } catch { this.restored = false; }
  }

  refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    this.lastAttempt = this.now().toISOString();
    try {
      const products = await this.client.fetchProducts();
      const map = parseMapProduct(products.map);
      const warnings: StructuredWarning[] = [...map.warnings];
      const unknownPhenomena = Object.values(map.departments).reduce((total, department) => total + department.warnings.filter((warning) => warning.code === "UNKNOWN_PHENOMENON").length, 0);
      if (unknownPhenomena) this.metrics.inc("vigilance_unknown_phenomena_total", unknownPhenomena);
      let bulletinProductDatetime: string | null = null;
      if (products.bulletins) {
        const bulletins = parseBulletinProduct(products.bulletins, Object.keys(map.departments));
        bulletinProductDatetime = bulletins.productDatetime;
        if (map.productDatetime && bulletins.productDatetime && map.productDatetime !== bulletins.productDatetime) {
          warnings.push({ code: "BULLETIN_PRODUCT_MISMATCH", message: "Le produit textes ne correspond pas à la publication de la carte et n'est pas exposé." });
        } else {
          for (const [code, values] of Object.entries(bulletins.byDepartment)) if (map.departments[code]) map.departments[code].bulletins = values;
        }
      }
      const retrievedAt = this.now().toISOString();
      const snapshot: VigilanceSnapshot = {
        schema_version: 1,
        retrieved_at: retrievedAt,
        issued_at: map.issuedAt,
        publication_id: map.publicationId,
        map_product_datetime: map.productDatetime,
        bulletin_product_datetime: bulletinProductDatetime,
        departments: map.departments,
        warnings,
      };
      await this.persist(snapshot);
      this.snapshot = snapshot; this.lastSuccess = retrievedAt; this.lastError = null; this.restored = false;
      this.metrics.inc("vigilance_refresh_success_total"); this.updateMetrics();
      return true;
    } catch (error) {
      this.lastError = { code: errorCode(error), message: error instanceof Error ? error.message : "Échec de rafraîchissement" };
      this.metrics.inc("vigilance_refresh_failure_total");
      if (error instanceof Error && error.name === "SourceFormatError") this.metrics.inc("vigilance_parser_errors_total"); this.updateMetrics();
      return false;
    }
  }

  private async persist(snapshot: VigilanceSnapshot): Promise<void> {
    await mkdir(dirname(this.config.snapshotPath), { recursive: true });
    const temporary = `${this.config.snapshotPath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.config.snapshotPath);
  }

  getDepartment(code: string): DepartmentSnapshot | null { return this.snapshot?.departments[code.toUpperCase()] ?? null; }
  getSnapshot(): VigilanceSnapshot | null { return this.snapshot; }
  getStatus(): StoreStatus { return { freshness: this.freshness(), lastAttempt: this.lastAttempt, lastSuccess: this.lastSuccess, lastError: this.lastError, restored: this.restored }; }
  canServe(): boolean { const state = this.freshness(); return Boolean(this.snapshot) && (state === "fresh" || state === "stale"); }

  freshness(): FreshnessStatus {
    if (!this.snapshot?.retrieved_at) return "unknown";
    const age = (this.now().getTime() - Date.parse(this.snapshot.retrieved_at)) / 1000;
    if (!Number.isFinite(age)) return "unknown";
    if (age > this.config.expireAfterSeconds) return "expired";
    const maxValidity = Object.values(this.snapshot.departments).flatMap((department) => department.periods.map((period) => period.valid_until).filter((value): value is string => Boolean(value))).map(Date.parse).filter(Number.isFinite);
    if (maxValidity.length && this.now().getTime() > Math.max(...maxValidity)) return "expired";
    if (age > this.config.staleAfterSeconds || this.lastError) return "stale";
    return "fresh";
  }

  cacheAgeSeconds(): number | null {
    if (!this.snapshot) return null;
    const age = Math.floor((this.now().getTime() - Date.parse(this.snapshot.retrieved_at)) / 1000);
    return Number.isFinite(age) ? Math.max(0, age) : null;
  }

  private updateMetrics(): void {
    const age = this.cacheAgeSeconds(); if (age !== null) this.metrics.set("vigilance_snapshot_age_seconds", age);
  }
}
