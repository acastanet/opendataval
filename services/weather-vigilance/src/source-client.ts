import type { VigilanceConfig } from "./config.js";
import type { Metrics } from "./metrics.js";

export type FetchLike = typeof fetch;
export class UpstreamError extends Error {
  constructor(public code: string, message: string, public status?: number) { super(message); this.name = "UpstreamError"; }
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

export class MeteoFranceClient {
  private consecutiveFailures = 0;
  private openUntil = 0;
  constructor(private config: VigilanceConfig, private metrics: Metrics, private fetchImpl: FetchLike = globalThis.fetch.bind(globalThis), private now: () => number = Date.now) {}

  async fetchProducts(): Promise<{ map: unknown; bulletins: unknown | null }> {
    const map = await this.getJson(`${this.config.apiBaseUrl}/cartevigilance/encours`, false);
    const bulletins = await this.getJson(`${this.config.apiBaseUrl}/textesvigilance/encours`, true);
    return { map, bulletins };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { accept: "application/json", "user-agent": "opendataval-vigilance/1.0" };
    if (this.config.authMode === "bearer") headers.authorization = `Bearer ${this.config.apiToken}`;
    else headers.apikey = this.config.apiToken;
    return headers;
  }

  private async getJson(url: string, allow404: boolean): Promise<unknown | null> {
    if (!this.config.apiToken) throw new UpstreamError("AUTH_MISSING", "Jeton Météo-France absent");
    if (this.openUntil > this.now()) throw new UpstreamError("CIRCUIT_OPEN", "Circuit Météo-France ouvert");
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const started = this.now(); this.metrics.inc("vigilance_upstream_requests_total");
      try {
        const response = await this.fetchImpl(url, { headers: this.headers(), signal: AbortSignal.timeout(this.config.connectTimeoutMs + this.config.readTimeoutMs) });
        if (allow404 && response.status === 404) { this.onSuccess(); return null; }
        if (!response.ok) throw new UpstreamError("UPSTREAM_HTTP_ERROR", `Météo-France HTTP ${response.status}`, response.status);
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("json")) throw new UpstreamError("UPSTREAM_CONTENT_TYPE", `Type de contenu inattendu: ${contentType || "absent"}`);
        const length = Number(response.headers.get("content-length"));
        if (Number.isFinite(length) && length > this.config.maxResponseBytes) throw new UpstreamError("UPSTREAM_TOO_LARGE", "Réponse Météo-France trop volumineuse");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > this.config.maxResponseBytes) throw new UpstreamError("UPSTREAM_TOO_LARGE", "Réponse Météo-France trop volumineuse");
        let json: unknown;
        try { json = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { throw new UpstreamError("UPSTREAM_INVALID_JSON", "Réponse Météo-France non JSON"); }
        this.metrics.set("vigilance_upstream_duration_seconds", Math.max(0, this.now() - started) / 1000);
        this.onSuccess(); return json;
      } catch (error) {
        lastError = error; this.metrics.inc("vigilance_upstream_errors_total");
        if (attempt < this.config.maxRetries) await sleep(250 * (2 ** attempt));
      }
    }
    this.onFailure();
    if (lastError instanceof UpstreamError) throw lastError;
    const name = lastError instanceof Error ? lastError.name : "";
    throw new UpstreamError(name === "TimeoutError" || name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE", "Météo-France indisponible");
  }

  private onSuccess(): void { this.consecutiveFailures = 0; this.openUntil = 0; }
  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.config.circuitFailureThreshold) this.openUntil = this.now() + this.config.circuitOpenSeconds * 1000;
  }
}
