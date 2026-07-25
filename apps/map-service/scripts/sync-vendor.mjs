import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const paquet = require.resolve("maplibre-gl/package.json");
const dossierPaquet = dirname(paquet);
const metadata = JSON.parse(await readFile(paquet, "utf8"));
const destination = join(racine, "assets", "vendor");
await mkdir(destination, { recursive: true });

const version = String(metadata.version);
const js = `maplibre-gl-${version}.js`;
const css = `maplibre-gl-${version}.css`;
await copyFile(join(dossierPaquet, "dist", "maplibre-gl.js"), join(destination, js));
await copyFile(join(dossierPaquet, "dist", "maplibre-gl.css"), join(destination, css));
await writeFile(join(destination, "manifest.json"), `${JSON.stringify({ version, js, css }, null, 2)}\n`, "utf8");

const dossierGlyphes = join(racine, "assets", "glyphs", "Noto Sans Regular");
const glyphe = join(dossierGlyphes, "0-255.pbf");
await mkdir(dossierGlyphes, { recursive: true });
try {
  await access(glyphe);
} catch {
  const source = process.env.MAP_GLYPH_SOURCE_URL ?? "https://demotiles.maplibre.org/font/Noto%20Sans%20Regular/0-255.pbf";
  const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Téléchargement du glyphe impossible : HTTP ${response.status}`);
  await writeFile(glyphe, Buffer.from(await response.arrayBuffer()));
}
await writeFile(
  join(racine, "assets", "glyphs", "LICENSE-noto.txt"),
  "Noto Sans Regular — licence SIL Open Font License 1.1 (SPDX: OFL-1.1).\nSource de l’artefact PBF : MapLibre Demo Tiles.\n",
  "utf8",
);
console.log(`MapLibre ${version} et les glyphes cartographiques sont synchronisés.`);
