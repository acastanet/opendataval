import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { createInfoterreClient, ErreurInfoterre } from "../src/clients/infoterre.js";

const config = loadConfig({ GEOLOGIE_INFOTERRE_MAX_SCAN_BYTES: "1000" });

function reponse(init: { ok: boolean; status?: number; headers?: Record<string, string>; corps: ArrayBuffer }): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    headers: { get: (nom: string) => init.headers?.[nom.toLowerCase()] ?? null },
    arrayBuffer: async () => init.corps,
  } as unknown as Response;
}

test("recupererFiche décode le corps en latin1, jamais en UTF-8", async () => {
  // 0xe9 est le code Latin-1 de 'é' ; en UTF-8 ce même octet seul serait invalide.
  const corps = new Uint8Array([0x6e, 0x75, 0x6d, 0xe9, 0x72, 0x69, 0x73, 0xe9]).buffer;
  const fetchImpl = (async () => reponse({ ok: true, corps })) as unknown as typeof fetch;
  const client = createInfoterreClient(config, fetchImpl);
  const html = await client.recupererFiche("09372X0012/MONNA");
  assert.equal(html, "numérisé");
});

test("recupererFiche lève une erreur indisponible si InfoTerre répond en erreur HTTP", async () => {
  const fetchImpl = (async () => reponse({ ok: false, status: 503, corps: new ArrayBuffer(0) })) as unknown as typeof fetch;
  const client = createInfoterreClient(config, fetchImpl);
  await assert.rejects(
    () => client.recupererFiche("09372X0012/MONNA"),
    (error: unknown) => error instanceof ErreurInfoterre && error.genre === "indisponible",
  );
});

test("recupererFiche lève une erreur timeout si le fetch expire", async () => {
  const fetchImpl = (async () => {
    const err = new Error("expiré");
    err.name = "TimeoutError";
    throw err;
  }) as unknown as typeof fetch;
  const client = createInfoterreClient(config, fetchImpl);
  await assert.rejects(
    () => client.recupererFiche("09372X0012/MONNA"),
    (error: unknown) => error instanceof ErreurInfoterre && error.genre === "timeout",
  );
});

test("recupererScan refuse un hôte différent de ficheinfoterre.brgm.fr sans effectuer de requête", async () => {
  let appele = false;
  const fetchImpl = (async () => {
    appele = true;
    return reponse({ ok: true, corps: new ArrayBuffer(0) });
  }) as unknown as typeof fetch;
  const client = createInfoterreClient(config, fetchImpl);
  await assert.rejects(
    () => client.recupererScan("http://evil.example/scan?name=x.tif"),
    (error: unknown) => error instanceof ErreurInfoterre && error.genre === "reponse_invalide",
  );
  assert.equal(appele, false, "aucune requête réseau ne doit être émise vers un hôte non autorisé");
});

test("recupererScan refuse un scan dont le content-length dépasse la limite", async () => {
  const fetchImpl = (async () =>
    reponse({ ok: true, headers: { "content-length": "999999" }, corps: new ArrayBuffer(0) })) as unknown as typeof fetch;
  const client = createInfoterreClient(config, fetchImpl);
  await assert.rejects(
    () => client.recupererScan("http://ficheinfoterre.brgm.fr/InfoterreFiche/scan?name=x.tif"),
    (error: unknown) => error instanceof ErreurInfoterre && error.genre === "scan_trop_volumineux",
  );
});

test("recupererScan refuse un scan dont la taille réelle dépasse la limite, même sans content-length", async () => {
  const corps = new Uint8Array(2000).buffer;
  const fetchImpl = (async () => reponse({ ok: true, corps })) as unknown as typeof fetch;
  const client = createInfoterreClient(config, fetchImpl);
  await assert.rejects(
    () => client.recupererScan("http://ficheinfoterre.brgm.fr/InfoterreFiche/scan?name=x.tif"),
    (error: unknown) => error instanceof ErreurInfoterre && error.genre === "scan_trop_volumineux",
  );
});

test("recupererScan retourne le buffer du scan quand la taille est sous la limite", async () => {
  const corps = new Uint8Array([1, 2, 3]).buffer;
  const fetchImpl = (async () => reponse({ ok: true, corps })) as unknown as typeof fetch;
  const client = createInfoterreClient(config, fetchImpl);
  const buffer = await client.recupererScan("http://ficheinfoterre.brgm.fr/InfoterreFiche/scan?name=x.tif");
  assert.deepEqual([...buffer], [1, 2, 3]);
});
