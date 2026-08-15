import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "packages/shared/styles/design-system.css");
const targets = [
  "apps/web/public/eau/design-system.css",
  "apps/gateway-service/public/dalle/design-system.css",
  "apps/gateway-service/public/valfeu/design-system.css",
];

await Promise.all(targets.map(async (target) => {
  const destination = resolve(root, target);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}));

// Polices du référentiel Style VAL : récupérées par `node doc/design/fonts/fetch-fonts.mjs`
// (binaires non versionnés, voir doc/design/fonts/.gitignore), à recopier dans le
// dossier public pour que /fonts/*.woff2 résolve. Absentes, elles ne bloquent
// jamais le build : le design system retombe sur local() puis la pile système.
const fonts = ["SourceSerif4-Variable.woff2", "Inter-Variable.woff2"];
const fontsSource = resolve(root, "doc/design/fonts");
const fontsDestination = resolve(root, "apps/web/public/fonts");
await mkdir(fontsDestination, { recursive: true });
await Promise.all(fonts.map(async (font) => {
  try {
    await copyFile(resolve(fontsSource, font), resolve(fontsDestination, font));
  } catch {
    // Police non récupérée localement : dégradation prévue, pas une erreur de build.
  }
}));
