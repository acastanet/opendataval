export class HttpSourceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) { super(message); }
}

export async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpSourceError("UPSTREAM_TOO_LARGE", "Réponse amont trop volumineuse", response.status);
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new HttpSourceError("UPSTREAM_TOO_LARGE", "Réponse amont trop volumineuse", response.status);
    return text;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpSourceError("UPSTREAM_TOO_LARGE", "Réponse amont trop volumineuse", response.status); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  maxRetries: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) continue;
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Échec de la requête amont");
}
