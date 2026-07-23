import type { VigilanceConfig } from "./config.js";

export type FetchLike = typeof fetch;

export class UpstreamError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) { super(message); }
}

export class MeteoFranceClient {
  private failures = 0;
  private openUntil = 0;
  constructor(private readonly config: VigilanceConfig, private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis), private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {}

  async fetchProducts(): Promise<{ card: unknown; bulletins: unknown }> {
    const [card, bulletins] = await Promise.all([this.getJson(this.config.cardUrl), this.getJson(this.config.bulletinUrl, true)]);
    return { card, bulletins };
  }

  private async getJson(url: string, optional = false): Promise<unknown> {
    if (!this.config.apiToken) throw new UpstreamError("UPSTREAM_NOT_CONFIGURED", "Jeton Météo-France absent");
    if (Date.now() < this.openUntil) throw new UpstreamError("CIRCUIT_OPEN", "Circuit Météo-France temporairement ouvert");
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { accept: "application/json", apikey: this.config.apiToken, "user-agent": "opendataval-weather-vigilance/1.0" },
          signal: AbortSignal.timeout(this.config.connectTimeoutMs + this.config.readTimeoutMs),
        });
        if (optional && response.status === 404) { this.success(); return null; }
        if (!response.ok) throw new UpstreamError("UPSTREAM_HTTP_ERROR", `Météo-France HTTP ${response.status}`, response.status);
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("json")) throw new UpstreamError("UPSTREAM_CONTENT_TYPE_INVALID", "Le type de contenu Météo-France n'est pas JSON");
        const announced = Number(response.headers.get("content-length"));
        if (Number.isFinite(announced) && announced > this.config.maxResponseBytes) throw new UpstreamError("UPSTREAM_RESPONSE_TOO_LARGE", "Réponse Météo-France trop volumineuse");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > this.config.maxResponseBytes) throw new UpstreamError("UPSTREAM_RESPONSE_TOO_LARGE", "Réponse Météo-France trop volumineuse");
        try { const parsed = JSON.parse(new TextDecoder().decode(bytes)); this.success(); return parsed; }
        catch { throw new UpstreamError("UPSTREAM_JSON_INVALID", "Réponse Météo-France non JSON"); }
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxRetries) await this.sleep(Math.min(250 * 2 ** attempt, 2_000));
      }
    }
    this.failure();
    if (lastError instanceof UpstreamError) throw lastError;
    const name = lastError instanceof Error ? lastError.name : "";
    throw new UpstreamError(name === "TimeoutError" || name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE", "Météo-France indisponible");
  }

  private success(): void { this.failures = 0; this.openUntil = 0; }
  private failure(): void {
    this.failures += 1;
    if (this.failures >= this.config.circuitBreakerFailures) this.openUntil = Date.now() + this.config.circuitBreakerResetSeconds * 1_000;
  }
}
