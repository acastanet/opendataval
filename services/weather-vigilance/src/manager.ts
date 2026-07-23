import type { VigilanceConfig } from "./config.js";
import { buildDepartments, parseBulletins, parseCard } from "./parser.js";
import type { MeteoFranceClient } from "./client.js";
import type { Metrics } from "./metrics.js";
import type { SnapshotStore } from "./store.js";
import type { FreshnessStatus, RuntimeState, VigilanceSnapshot } from "./types.js";

export class VigilanceManager {
  readonly state: RuntimeState = { snapshot: null, lastAttemptAt: null, lastSuccessfulRetrieval: null, lastError: null };
  private timer: NodeJS.Timeout | null = null;
  private refreshing: Promise<boolean> | null = null;
  constructor(private readonly config: VigilanceConfig, private readonly client: MeteoFranceClient, private readonly store: SnapshotStore, private readonly metrics: Metrics, private readonly now: () => Date = () => new Date()) {}

  async initialize(startScheduler = true): Promise<void> {
    this.state.snapshot = await this.store.load();
    this.state.lastSuccessfulRetrieval = this.state.snapshot?.retrievedAt ?? null;
    if (startScheduler) {
      void this.refresh();
      this.timer = setInterval(() => void this.refresh(), this.config.refreshSeconds * 1_000);
      this.timer.unref();
    }
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  freshness(at = this.now()): FreshnessStatus {
    const snapshot = this.state.snapshot;
    if (!snapshot?.retrievedAt) return "unknown";
    const age = (at.getTime() - new Date(snapshot.retrievedAt).getTime()) / 1_000;
    if (!Number.isFinite(age)) return "unknown";
    const officialEnds = Object.values(snapshot.departments)
      .flatMap((department) => department.periods.map((period) => period.validUntil))
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    if (officialEnds.length > 0 && Math.max(...officialEnds) < at.getTime()) return "expired";
    if (age >= this.config.expireAfterSeconds) return "expired";
    if (age >= this.config.staleAfterSeconds || this.state.lastError) return "stale";
    return "fresh";
  }

  ageSeconds(at = this.now()): number | null {
    if (!this.state.snapshot?.retrievedAt) return null;
    return Math.max(0, Math.floor((at.getTime() - new Date(this.state.snapshot.retrievedAt).getTime()) / 1_000));
  }

  async refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const attemptedAt = this.now().toISOString();
    this.state.lastAttemptAt = attemptedAt;
    this.metrics.increment("vigilance_upstream_requests_total");
    const started = Date.now();
    try {
      const products = await this.client.fetchProducts();
      const card = parseCard(products.card);
      const bulletins = parseBulletins(products.bulletins);
      const departments = buildDepartments(card, bulletins);
      const retrievedAt = this.now().toISOString();
      const snapshot: VigilanceSnapshot = {
        schemaVersion: 1,
        retrievedAt,
        lastAttemptAt: attemptedAt,
        source: { name: "Météo-France", product: "Vigilance météorologique", issuedAt: card.issuedAt, retrievedAt, publicationId: card.publicationId },
        departments,
        globalWarnings: card.warnings,
      };
      await this.store.save(snapshot);
      this.state.snapshot = snapshot;
      this.state.lastSuccessfulRetrieval = retrievedAt;
      this.state.lastError = null;
      this.metrics.increment("vigilance_refresh_success_total");
      const unknown = Object.values(departments)
        .flatMap((department) => department.periods.flatMap((period) => period.phenomena))
        .filter((phenomenon) => phenomenon.code === "unknown").length;
      if (unknown) this.metrics.increment("vigilance_unknown_phenomena_total", unknown);
      return true;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "REFRESH_FAILED";
      this.state.lastError = { code, message: error instanceof Error ? error.message : "Échec de rafraîchissement", at: attemptedAt };
      this.metrics.increment("vigilance_upstream_errors_total");
      this.metrics.increment("vigilance_refresh_failure_total");
      if (code.includes("FORMAT") || code.includes("JSON")) this.metrics.increment("vigilance_parser_errors_total");
      return false;
    } finally {
      this.metrics.gauge("vigilance_upstream_duration_seconds", (Date.now() - started) / 1_000);
      const age = this.ageSeconds();
      if (age !== null) this.metrics.gauge("vigilance_snapshot_age_seconds", age);
    }
  }
}
