import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ErreurConversionImage, redimensionnerImageVersPngBase64, tiffVersPngBase64 } from "./conversion-image.js";

const execFileAsync = promisify(execFile);

export type DocumentConverti = { type: "image"; pngBase64: string } | { type: "texte"; texte: string };

export interface Convertisseur {
  /** Convertit le scan brut d'un document (TIFF ou PDF) en contenu exploitable par le LLM. Ne lève jamais : les erreurs sont enveloppées dans ErreurConversionImage. */
  convertir(buffer: Buffer, nomDocument: string): Promise<DocumentConverti>;
}

const TIMEOUT_OUTIL_MS = 10_000;
/** Nombre de caractères non-espaces en dessous duquel un PDF est considéré comme scanné (sans couche texte). */
const SEUIL_TEXTE_SIGNIFICATIF = 40;
const MAX_CARACTERES_TEXTE = 6_000;
const RESOLUTION_RENDU_DPI = 150;

function estPdf(nomDocument: string): boolean {
  return nomDocument.toLowerCase().endsWith(".pdf");
}

async function extraireTextePremierePagePdf(cheminPdf: string): Promise<string> {
  const { stdout } = await execFileAsync("pdftotext", ["-f", "1", "-l", "1", cheminPdf, "-"], {
    timeout: TIMEOUT_OUTIL_MS,
  });
  return stdout;
}

async function rasteriserPremierePagePdf(cheminPdf: string, prefixeSortie: string): Promise<Buffer> {
  await execFileAsync(
    "pdftoppm",
    ["-png", "-r", String(RESOLUTION_RENDU_DPI), "-f", "1", "-l", "1", cheminPdf, prefixeSortie],
    { timeout: TIMEOUT_OUTIL_MS },
  );
  return readFile(`${prefixeSortie}-1.png`);
}

async function convertirPdf(buffer: Buffer, largeurCibleMax: number): Promise<DocumentConverti> {
  const dossierTemporaire = await mkdtemp(join(tmpdir(), "geologie-pdf-"));
  try {
    const cheminPdf = join(dossierTemporaire, "document.pdf");
    await writeFile(cheminPdf, buffer);

    const texte = await extraireTextePremierePagePdf(cheminPdf);
    if (texte.replace(/\s/g, "").length >= SEUIL_TEXTE_SIGNIFICATIF) {
      return { type: "texte", texte: texte.trim().slice(0, MAX_CARACTERES_TEXTE) };
    }

    const png = await rasteriserPremierePagePdf(cheminPdf, join(dossierTemporaire, "page"));
    const pngBase64 = await redimensionnerImageVersPngBase64(png, largeurCibleMax);
    return { type: "image", pngBase64 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErreurConversionImage(`Échec de conversion PDF : ${message}`);
  } finally {
    await rm(dossierTemporaire, { recursive: true, force: true });
  }
}

export function createConvertisseur(largeurCibleMax: number): Convertisseur {
  return {
    async convertir(buffer, nomDocument) {
      if (estPdf(nomDocument)) return convertirPdf(buffer, largeurCibleMax);
      const pngBase64 = await tiffVersPngBase64(buffer, largeurCibleMax);
      return { type: "image", pngBase64 };
    },
  };
}
