import { readFile } from "node:fs/promises";

/**
 * Helpers de test : fetch simulé servant un fichier local comme flux CSV, et
 * stub de géocodage. Partagés entre les tests d'intégration et HTTP pour éviter
 * toute dépendance réseau.
 */
export function localFetchForTest(file: string, url: string) {
  return (async (input: string | URL | Request, _init?: RequestInit) => {
    const content = await readFile(file);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(content));
        controller.close();
      },
    });
    return new Response(stream as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: { "content-type": "text/csv" },
    });
  }) as typeof fetch;
}

export function geocodingStubForTest() {
  return (async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input));
    const q = url.searchParams.get("q") ?? "";
    const atMunicipality = /VALLERAUGUE|ROUVIERE/.test(q);
    return new Response(
      JSON.stringify({
        features: atMunicipality
          ? [
              {
                geometry: { coordinates: [3.6421, 44.0812] },
                properties: { score: 0.91, type: "municipality" },
              },
            ]
          : [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}
