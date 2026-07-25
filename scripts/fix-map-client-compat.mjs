import { readFile, writeFile } from "node:fs/promises";

const path = "apps/web/src/lib/carte.ts";
const original = await readFile(path, "utf8");
let contenu = original;

if (!contenu.includes("export const IGN_WMTS")) {
  contenu = contenu.replace(
    'export const BASE_CARTE = "/api/v2/map";\n',
    `export const BASE_CARTE = "/api/v2/map";

/** Adaptateur historique : résout un identifiant de couche IGN vers le proxy cartographique local. */
export const IGN_WMTS = (layer: string, format: string): string => {
  const fond = FONDS_CARTOGRAPHIQUES.find((item) => item.coucheIgn === layer && item.format === format);
  if (!fond) throw new Error(\`Fond IGN non autorisé : \${layer}\`);
  return \`\${BASE_CARTE}/tiles/\${fond.id}/{z}/{x}/{y}.\${fond.extension}\`;
};
`,
  );
}

if (contenu !== original) await writeFile(path, contenu, "utf8");
console.log("Compatibilité du client cartographique appliquée.");
