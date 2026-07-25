import type { FireDetectionConfig } from "./config.js";
import { deduplicateDetections, latestObservation, parseCapXml, type FireDetection } from "./domain.js";
import { fetchWithRetry, readLimitedText } from "./http.js";
import type { DetectionBatch } from "./firms-client.js";

type EumetsatSource = "EUMETSAT_MTG_CAP" | "EUMETSAT_MSG_CAP";
interface Token { value: string; expiresAt: number; }

function stringsDeep(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const entry of value) stringsDeep(entry, output);
  else if (value && typeof value === "object") for (const entry of Object.values(value)) stringsDeep(entry, output);
  return output;
}

export function productIds(payload: unknown): string[] {
  const candidates: string[] = [];
  const root = payload as { features?: unknown; products?: unknown; items?: unknown };
  const entries = Array.isArray(root?.features) ? root.features : Array.isArray(root?.products) ? root.products : Array.isArray(root?.items) ? root.items : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const properties = record.properties && typeof record.properties === "object" ? record.properties as Record<string, unknown> : {};
    for (const value of [properties.identifier, properties.productIdentifier, properties.product_id, record.identifier, record.id]) {
      if (typeof value === "string" && value.trim() && !value.startsWith("EO:EUM:DAT:")) candidates.push(value.trim());
    }
  }
  return [...new Set(candidates)];
}

function totalResults(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const queue: unknown[] = [payload];
  const names = new Set(["totalresults", "total_results", "totalitems", "total_items"]);
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current)) {
      if (names.has(key.toLowerCase())) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}

export function entryCandidates(metadata: unknown, productId: string): string[] {
  const candidates = stringsDeep(metadata)
    .flatMap((value) => {
      try { return [decodeURIComponent(new URL(value).pathname.split("/").pop() ?? "")]; }
      catch { return [value]; }
    })
    .map((value) => value.trim())
    .filter((value) => /\.(?:xml|cap)$/i.test(value));
  candidates.push(`${productId}.xml`, productId);
  return [...new Set(candidates)];
}

async function mapLimit<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await work(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export class EumetsatClient {
  private token: Token | null = null;
  constructor(
    private readonly config: FireDetectionConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private configured(): boolean { return Boolean(this.config.eumetsatConsumerKey && this.config.eumetsatConsumerSecret); }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now().getTime() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.config.eumetsatConsumerKey}:${this.config.eumetsatConsumerSecret}`).toString("base64");
    const response = await fetchWithRetry(this.fetchImpl, this.config.eumetsatTokenUrl, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: "grant_type=client_credentials",
    }, this.config.eumetsatTimeoutMs, 1);
    const text = await readLimitedText(response, 100_000);
    if (!response.ok) throw new Error(`Jeton EUMETSAT HTTP ${response.status}: ${text.slice(0, 160)}`);
    const payload = JSON.parse(text) as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("Jeton EUMETSAT absent");
    const expiresIn = Number(payload.expires_in ?? 3600);
    this.token = { value: payload.access_token, expiresAt: this.now().getTime() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000 };
    return this.token.value;
  }

  private async search(collection: string): Promise<string[]> {
    const end = this.now();
    const start = new Date(end.getTime() - this.config.realtimeWindowMinutes * 60_000);
    const identifiers = new Set<string>();
    let expectedTotal: number | null = null;

    for (let page = 0; page < this.config.eumetsatMaxPages; page += 1) {
      const url = new URL(this.config.eumetsatSearchUrl);
      url.searchParams.set("format", "json");
      url.searchParams.set("pi", collection);
      url.searchParams.set("sort", "start,time,0");
      url.searchParams.set("dtstart", start.toISOString());
      url.searchParams.set("dtend", end.toISOString());
      url.searchParams.set("si", String(page * this.config.eumetsatPageSize));
      url.searchParams.set("c", String(this.config.eumetsatPageSize));
      const response = await fetchWithRetry(this.fetchImpl, url, { headers: { accept: "application/json" } }, this.config.eumetsatTimeoutMs, 1);
      const text = await readLimitedText(response, this.config.maxResponseBytes);
      if (!response.ok) throw new Error(`Recherche EUMETSAT HTTP ${response.status}: ${text.slice(0, 160)}`);
      const payload = JSON.parse(text);
      const pageIds = productIds(payload);
      expectedTotal ??= totalResults(payload);
      const previousSize = identifiers.size;
      for (const id of pageIds) identifiers.add(id);

      if (expectedTotal !== null && identifiers.size >= expectedTotal) return [...identifiers];
      if (pageIds.length === 0) return [...identifiers];
      if (identifiers.size === previousSize) {
        if (expectedTotal !== null && identifiers.size < expectedTotal) throw new Error(`Pagination EUMETSAT bloquée : ${identifiers.size}/${expectedTotal} produits récupérés`);
        return [...identifiers];
      }
      if (expectedTotal === null && pageIds.length < this.config.eumetsatPageSize) return [...identifiers];
    }
    throw new Error(`Recherche EUMETSAT tronquée après ${this.config.eumetsatMaxPages} pages`);
  }

  private async metadata(collection: string, productId: string): Promise<unknown> {
    const url = new URL(`${this.config.eumetsatBrowseUrl}/collections/${encodeURIComponent(collection)}/products/${encodeURIComponent(productId)}`);
    url.searchParams.set("format", "json");
    const response = await fetchWithRetry(this.fetchImpl, url, { headers: { accept: "application/json" } }, this.config.eumetsatTimeoutMs, 1);
    const text = await readLimitedText(response, this.config.maxResponseBytes);
    if (!response.ok) return {};
    try { return JSON.parse(text); } catch { return {}; }
  }

  private async downloadEntry(collection: string, productId: string, entry: string, token: string): Promise<string | null> {
    const url = new URL(`${this.config.eumetsatDownloadUrl}/collections/${encodeURIComponent(collection)}/products/${encodeURIComponent(productId)}/entry`);
    url.searchParams.set("name", entry);
    url.searchParams.set("access_token", token);
    const response = await fetchWithRetry(this.fetchImpl, url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/xml,text/xml,*/*" },
    }, this.config.eumetsatTimeoutMs, 1);
    const text = await readLimitedText(response, this.config.maxResponseBytes);
    if (!response.ok) return null;
    return /<(?:(?:\w+):)?alert\b/i.test(text) ? text : null;
  }

  async fetchCollection(
    collection: string,
    source: EumetsatSource,
    latitude: number,
    longitude: number,
    radiusKm: number,
  ): Promise<DetectionBatch> {
    const retrievedAt = this.now().toISOString();
    if (!this.configured()) return { detections: [], reports: [{
      source,
      state: "not_configured",
      retrieved_at: retrievedAt,
      latest_observation_at: null,
      detection_count: 0,
      detail: "EUMETSAT_CONSUMER_KEY ou EUMETSAT_CONSUMER_SECRET absent",
    }] };
    try {
      const ids = await this.search(collection);
      if (!ids.length) return { detections: [], reports: [{ source, state: "available", retrieved_at: retrievedAt, latest_observation_at: null, detection_count: 0 }] };
      const token = await this.accessToken();
      const products = await mapLimit(ids, this.config.eumetsatDownloadConcurrency, async (productId) => {
        const metadata = await this.metadata(collection, productId);
        let xml: string | null = null;
        for (const candidate of entryCandidates(metadata, productId)) {
          try { xml = await this.downloadEntry(collection, productId, candidate, token); }
          catch { xml = null; }
          if (xml) break;
        }
        if (!xml) return { productId, detections: [] as FireDetection[], failed: true };
        try { return { productId, detections: parseCapXml(xml, source, { latitude, longitude }, radiusKm), failed: false }; }
        catch { return { productId, detections: [] as FireDetection[], failed: true }; }
      });
      const unique = deduplicateDetections(products.flatMap((product) => product.detections));
      const failed = products.filter((product) => product.failed).map((product) => product.productId);
      return { detections: unique, reports: [{
        source,
        state: failed.length === ids.length ? "unavailable" : "available",
        retrieved_at: retrievedAt,
        latest_observation_at: latestObservation(unique),
        detection_count: unique.length,
        ...(failed.length ? { detail: `${ids.length - failed.length}/${ids.length} produit(s) CAP exploité(s)` } : {}),
      }] };
    } catch (error) {
      return { detections: [], reports: [{
        source,
        state: "unavailable",
        retrieved_at: retrievedAt,
        latest_observation_at: null,
        detection_count: 0,
        detail: error instanceof Error ? error.message : "Erreur EUMETSAT inconnue",
      }] };
    }
  }
}
