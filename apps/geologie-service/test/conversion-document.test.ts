import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { createConvertisseur } from "../src/services/conversion-document.js";

const execFileAsync = promisify(execFile);

/**
 * `pdftotext`/`pdftoppm` (poppler-utils) sont une dépendance système, pas un paquet npm : absente
 * en environnement de dev non provisionné, ou parfois présente mais cassée (conflit de PATH avec
 * une autre installation). Dans les deux cas, on ignore proprement ces tests plutôt que de faire
 * échouer toute la suite — même principe défensif que GEOLOGIE_TEST_LIVE pour les appels réseau réels.
 */
async function outilsPdfDisponibles(): Promise<boolean> {
  try {
    await execFileAsync("pdftotext", ["-v"]);
    await execFileAsync("pdftoppm", ["-v"]);
    return true;
  } catch {
    return false;
  }
}

const PDF_TEXTE = readFileSync(fileURLToPath(new URL("./fixtures/rapport-texte.pdf", import.meta.url)));
const PDF_SCANNE = readFileSync(fileURLToPath(new URL("./fixtures/rapport-scanne.pdf", import.meta.url)));

test("un PDF avec une couche texte exploitable est retourné en texte", async (t) => {
  if (!(await outilsPdfDisponibles())) {
    t.skip("poppler-utils (pdftotext/pdftoppm) indisponible ou inutilisable sur cette machine");
    return;
  }
  const convertisseur = createConvertisseur(1400);
  const resultat = await convertisseur.convertir(PDF_TEXTE, "rapport-texte.pdf");
  assert.equal(resultat.type, "texte");
  assert.ok(resultat.type === "texte" && resultat.texte.includes("argile puis granite"));
});

test("un PDF sans couche texte (scanné) est rasterisé en image PNG", async (t) => {
  if (!(await outilsPdfDisponibles())) {
    t.skip("poppler-utils (pdftotext/pdftoppm) indisponible ou inutilisable sur cette machine");
    return;
  }
  const convertisseur = createConvertisseur(1400);
  const resultat = await convertisseur.convertir(PDF_SCANNE, "rapport-scanne.pdf");
  assert.equal(resultat.type, "image");
  if (resultat.type === "image") {
    const buffer = Buffer.from(resultat.pngBase64, "base64");
    // Signature PNG : 89 50 4E 47 0D 0A 1A 0A.
    assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
});

test("un document TIFF passe toujours par la conversion image directe (comportement inchangé)", async () => {
  const tiffReel = readFileSync(fileURLToPath(new URL("./fixtures/M541404.tif", import.meta.url)));
  const convertisseur = createConvertisseur(1400);
  const resultat = await convertisseur.convertir(tiffReel, "M541404.TIF");
  assert.equal(resultat.type, "image");
});
