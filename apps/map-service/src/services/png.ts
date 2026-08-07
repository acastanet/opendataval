import { deflateSync } from "node:zlib";

/**
 * Encodeur PNG minimal (RGB 8 bits, non entrelacé, filtre 0).
 *
 * Node ne sait écrire aucun format d'image nativement, et les tuiles d'altitude
 * converties depuis le WMS altimétrique doivent bien ressortir en image. Le PNG est le
 * seul format qu'on puisse produire sans binaire natif : en-têtes triviaux et
 * compression déléguée au `zlib` intégré. L'image Docker reste donc inchangée.
 *
 * Le WebP sans perte compresserait mieux — c'est ce que contiennent les archives
 * PMTiles — mais son encodage exigerait une dépendance native.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const octet of data) c = TABLE_CRC[(c ^ octet) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type: string, data: Buffer): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(data.length);
  const corps = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const controle = Buffer.alloc(4);
  controle.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, controle]);
}

/**
 * Encode une image RGB en PNG.
 *
 * @param rgb - `largeur × hauteur × 3` octets, dans l'ordre des lignes.
 * @param niveau - niveau de compression zlib ; 3 suffit sur du terrarium, dont les
 *   canaux de poids fort sont très redondants, et divise par trois le temps d'encodage.
 */
export function encoderPng(rgb: Buffer, largeur: number, hauteur: number, niveau = 3): Buffer {
  if (rgb.length !== largeur * hauteur * 3) throw new Error("Les dimensions ne correspondent pas au tampon RGB.");

  const enTete = Buffer.alloc(13);
  enTete.writeUInt32BE(largeur, 0);
  enTete.writeUInt32BE(hauteur, 4);
  enTete[8] = 8; // profondeur de bit
  enTete[9] = 2; // type couleur : vérité RGB
  enTete[10] = 0; // compression deflate
  enTete[11] = 0; // filtrage adaptatif
  enTete[12] = 0; // pas d'entrelacement

  // Chaque ligne est préfixée de son type de filtre ; 0 = aucun.
  const brut = Buffer.alloc(hauteur * (1 + largeur * 3));
  for (let y = 0; y < hauteur; y++) {
    const depart = y * (1 + largeur * 3);
    brut[depart] = 0;
    rgb.copy(brut, depart + 1, y * largeur * 3, (y + 1) * largeur * 3);
  }

  return Buffer.concat([
    SIGNATURE,
    bloc("IHDR", enTete),
    bloc("IDAT", deflateSync(brut, { level: niveau })),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}
