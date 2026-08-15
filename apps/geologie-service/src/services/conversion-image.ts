import sharp from "sharp";

export class ErreurConversionImage extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurConversionImage";
  }
}

/**
 * Redimensionne une image (TIFF, PNG…) en PNG encodé base64, pour rester lisible sans peser
 * excessivement dans un appel LLM ou une réponse HTTP. Partagée entre les scans TIFF et les
 * pages de PDF rasterisées (voir conversion-document.ts).
 */
export async function redimensionnerImageVersPngBase64(image: Buffer, largeurCibleMax: number): Promise<string> {
  try {
    const png = await sharp(image)
      .resize({ width: largeurCibleMax, withoutEnlargement: true })
      .png()
      .toBuffer();
    return png.toString("base64");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErreurConversionImage(`Échec de conversion image → PNG : ${message}`);
  }
}

/** Convertit un scan TIFF (souvent 1 bit/pixel, compression fax Group4) en PNG encodé base64. */
export async function tiffVersPngBase64(tiff: Buffer, largeurCibleMax: number): Promise<string> {
  return redimensionnerImageVersPngBase64(tiff, largeurCibleMax);
}
