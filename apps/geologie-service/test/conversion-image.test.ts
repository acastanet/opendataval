import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ErreurConversionImage, tiffVersPngBase64 } from "../src/services/conversion-image.js";

/** Scan réel capturé sur la fiche MONNA : 3324×2239 px, 1 bit/pixel, compression fax Group4. */
const TIFF = readFileSync(fileURLToPath(new URL("./fixtures/M541404.tif", import.meta.url)));

test("convertit un TIFF réel en PNG base64 valide", async () => {
  const png = await tiffVersPngBase64(TIFF, 1400);
  assert.ok(png.length > 0);
  const buffer = Buffer.from(png, "base64");
  // Signature PNG : 89 50 4E 47 0D 0A 1A 0A.
  assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("redimensionne à la largeur cible sans agrandir", async () => {
  const sharp = (await import("sharp")).default;

  const pngLarge = await tiffVersPngBase64(TIFF, 700);
  const metaLarge = await sharp(Buffer.from(pngLarge, "base64")).metadata();
  assert.equal(metaLarge.width, 700);

  // Le TIFF source fait 3324 px de large : demander 10000 ne doit pas l'agrandir.
  const pngNonAgrandi = await tiffVersPngBase64(TIFF, 10_000);
  const metaNonAgrandi = await sharp(Buffer.from(pngNonAgrandi, "base64")).metadata();
  assert.equal(metaNonAgrandi.width, 3324);
});

test("lève ErreurConversionImage sur un contenu qui n'est pas une image décodable", async () => {
  await assert.rejects(
    () => tiffVersPngBase64(Buffer.from("ceci n'est pas une image"), 1400),
    ErreurConversionImage,
  );
});
