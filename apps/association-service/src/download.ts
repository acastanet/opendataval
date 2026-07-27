import { type ReadableStream as NodeReadableStream } from "node:stream/web";

export interface DownloadResult {
  status: number;
  contentType: string | null;
  body: NodeReadableStream<Uint8Array>;
}

/**
 * Télécharge en flux une ressource publique sans jamais en charger le corps
 * complet dans une chaîne. Vérifie le code HTTP et le type de contenu avant de
 * restituer le flux. Applique un délai réseau explicite.
 */
export async function downloadStream(
  url: string,
  options: { timeoutMs: number; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<DownloadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal =
    options.signal ?? AbortSignal.timeout(options.timeoutMs);
  const response = await fetchImpl(url, {
    headers: { accept: "text/csv,application/csv,text/plain" },
    signal,
  });
  if (!response.ok)
    throw new Error(`Source RNA HTTP ${response.status} (${url})`);
  const contentType = response.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const acceptedTypes = new Set([
    "text/csv",
    "application/csv",
    "text/plain",
    "application/octet-stream",
  ]);
  if (!mediaType || !acceptedTypes.has(mediaType)) {
    await response.body?.cancel();
    throw new Error(
      `Type de contenu RNA invalide (${contentType ?? "absent"}, ${url})`,
    );
  }
  const body = response.body;
  if (!body)
    throw new Error(`Corps de réponse absent (${url})`);
  return {
    status: response.status,
    contentType,
    body: body as unknown as NodeReadableStream<Uint8Array>,
  };
}
