import sharp from "sharp";

export class ErreurConversionImage extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurConversionImage";
  }
}

/**
 * Convertit un scan TIFF (souvent 1 bit/pixel, compression fax Group4) en PNG encodé base64,
 * redimensionné pour rester lisible sans peser excessivement dans un appel LLM ou une réponse HTTP.
 */
export async function tiffVersPngBase64(tiff: Buffer, largeurCibleMax: number): Promise<string> {
  try {
    const png = await sharp(tiff)
      .resize({ width: largeurCibleMax, withoutEnlargement: true })
      .png()
      .toBuffer();
    return png.toString("base64");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErreurConversionImage(`Échec de conversion TIFF → PNG : ${message}`);
  }
}
