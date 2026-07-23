export type FetchLike = typeof fetch;

export class UpstreamError extends Error {
  constructor(public readonly kind: "timeout" | "unavailable" | "not_found", message: string) { super(message); }
}

export async function fetchJson(fetchImpl: FetchLike, url: URL, timeoutMs: number): Promise<unknown> {
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "opendataval-geography-service/0.1" }, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 404) throw new UpstreamError("not_found", "fournisseur sans résultat");
    if (!response.ok) throw new UpstreamError("unavailable", `fournisseur HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    const name = error instanceof Error ? error.name : "";
    throw new UpstreamError(name === "AbortError" || name === "TimeoutError" ? "timeout" : "unavailable", "fournisseur indisponible");
  }
}
