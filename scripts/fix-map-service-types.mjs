import { readFile, writeFile } from "node:fs/promises";

const path = "apps/map-service/src/app.ts";
const original = await readFile(path, "utf8");
const contenu = original
  .replace("const nom = request.params.style;", "const nom = String(request.params.style ?? \"\");")
  .replace("trouverLegende(request.params.layer)", "trouverLegende(String(request.params.layer ?? \"\"))")
  .replace(
    "actifs.glyphe(request.params.fontstack, request.params.range)",
    "actifs.glyphe(String(request.params.fontstack ?? \"\"), String(request.params.range ?? \"\"))",
  )
  .replace("relief.getTile(tuile.z, tuile.x, tuile.y, request.raw.signal)", "relief.getTile(tuile.z, tuile.x, tuile.y)");

if (contenu !== original) await writeFile(path, contenu, "utf8");
console.log("Correctifs de typage map-service appliqués.");
