import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
await writeFile(
  join(destination, "manifest.json"),
  `${JSON.stringify({ version, js, css }, null, 2)}\n`,
  "utf8",
);
console.log(`MapLibre ${version} synchronisé dans assets/vendor.`);
