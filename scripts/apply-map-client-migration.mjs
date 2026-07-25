import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function remplacerFichier(path, transformations) {
  let contenu = await readFile(path, "utf8");
  for (const transformation of transformations) {
    const avant = contenu;
    contenu = transformation(contenu);
    if (contenu === avant) throw new Error(`Transformation sans effet dans ${path}`);
  }
  await writeFile(path, contenu, "utf8");
}

const cartePath = "apps/web/src/lib/carte.ts";
await remplacerFichier(cartePath, [
  (contenu) => contenu.replace('import { PMTiles } from "pmtiles";\n', `import {
  FONDS_CARTOGRAPHIQUES,
  IDS_CARTOGRAPHIQUES,
  PALETTE_HYPSOMETRIQUE as PALETTE_PARTAGEE,
  RELIEF_ATTRIBUTION,
  RELIEF_BOUNDS,
  RELIEF_MAXZOOM,
  gabaritTuilesRadar as gabaritRadarPartage,
  prefixerId,
} from "@opendata-vda/shared/carto";
`),
  (contenu) => contenu.replace(
`export const IGN_WMTS = (layer: string, format: string): string =>
  \`https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=\${layer}\` +
  \`&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=\${format}\`;

export const BASEMAPS = [
  { id: "plan", label: "Plan", tiles: IGN_WMTS("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png"), attribution: "© IGN" },
  { id: "photo", label: "Photo aérienne", tiles: IGN_WMTS("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg"), attribution: "© IGN" },
  { id: "satellite", label: "Satellite (SPOT)", tiles: IGN_WMTS("ORTHOIMAGERY.ORTHO-SAT.SPOT.2022", "image/jpeg"), attribution: "© IGN" },
];
`,
`export const BASE_CARTE = "/api/v2/map";
export type NomStyle = "plan" | "territoire" | "relief" | "hypsometrique";
export interface OptionsStyle {
  prefixe?: string;
  fond?: "plan" | "photo" | "satellite" | "nu";
  terrain?: boolean;
  exageration?: number;
  geologie?: boolean;
  relief?: boolean;
}

export function urlStyle(nom: NomStyle, options: OptionsStyle = {}): string {
  const params = new URLSearchParams();
  if (options.prefixe) params.set("prefixe", options.prefixe);
  if (options.fond) params.set("fond", options.fond);
  if (options.terrain !== undefined) params.set("terrain", options.terrain ? "1" : "0");
  if (options.exageration !== undefined) params.set("exageration", String(options.exageration));
  if (options.geologie !== undefined) params.set("geologie", options.geologie ? "1" : "0");
  if (options.relief !== undefined) params.set("relief", options.relief ? "1" : "0");
  const query = params.toString();
  return \`\${BASE_CARTE}/styles/\${nom}.json\${query ? \`?\${query}\` : ""}\`;
}

export const BASEMAPS = FONDS_CARTOGRAPHIQUES.map((fond) => ({
  id: fond.id,
  label: fond.libelle,
  tiles: \`\${BASE_CARTE}/tiles/\${fond.id}/{z}/{x}/{y}.\${fond.extension}\`,
  attribution: fond.attribution,
}));

export function idCouche(role: keyof typeof IDS_CARTOGRAPHIQUES.couches, prefixe?: string): string {
  return prefixerId(IDS_CARTOGRAPHIQUES.couches[role], prefixe);
}

export function idSourceRelief(prefixe?: string): string {
  return prefixerId(IDS_CARTOGRAPHIQUES.sources.relief, prefixe);
}

export function gabaritTuilesRadar(cheminFrame: string): string {
  return gabaritRadarPartage(cheminFrame);
}
`),
  (contenu) => contenu.replace(
`export const GEOLOGIE_WMS =
  "https://geoservices.brgm.fr/geologie?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=SCAN_D_GEOL50" +
  "&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true";
`,
`export const GEOLOGIE_WMS = \`\${BASE_CARTE}/tiles/geologie/{z}/{x}/{y}.png\`;
`),
  (contenu) => {
    const debut = contenu.indexOf('const RELIEF_PMTILES_URL = "/relief/aigoual.pmtiles";');
    if (debut < 0) return contenu;
    return `${contenu.slice(0, debut)}export const RELIEF_PROTOCOL = "aigoualdem";
export const RELIEF_SOURCE_ID = IDS_CARTOGRAPHIQUES.sources.relief;
const RELIEF_HILLSHADE_ID = IDS_CARTOGRAPHIQUES.couches.hillshade;
export const PALETTE_HYPSOMETRIQUE = PALETTE_PARTAGEE.map(({ altitude, couleur }) => ({ altitude, couleur }));

/** Compatibilité temporaire : les îlots peuvent conserver cet appel, aucun protocole custom n'est enregistré. */
export function enregistrerProtocolePmtiles(_addProtocol: (scheme: string, loader: unknown) => void): void {}

export function ajouterSourceRelief(map: maplibregl.Map, prefixe?: string): void {
  const sourceId = idSourceRelief(prefixe);
  if (map.getSource(sourceId)) return;
  map.addSource(sourceId, {
    type: "raster-dem",
    tiles: [\`${BASE_CARTE}/relief/{z}/{x}/{y}.png\`],
    encoding: "terrarium",
    tileSize: 512,
    maxzoom: RELIEF_MAXZOOM,
    bounds: [...RELIEF_BOUNDS],
    attribution: RELIEF_ATTRIBUTION,
  });
}

export function activerRelief(map: maplibregl.Map, exageration: number, prefixe?: string): void {
  const sourceId = idSourceRelief(prefixe);
  const hillshadeId = prefixerId(RELIEF_HILLSHADE_ID, prefixe);
  ajouterSourceRelief(map, prefixe);
  if (!map.getLayer(hillshadeId)) {
    map.addLayer({
      id: hillshadeId,
      type: "hillshade",
      source: sourceId,
      paint: { "hillshade-exaggeration": 0.3 },
    });
  } else {
    map.setLayoutProperty(hillshadeId, "visibility", "visible");
  }
  map.setTerrain({ source: sourceId, exaggeration: exageration });
}

export function reglerExagerationRelief(map: maplibregl.Map, exageration: number, prefixe?: string): void {
  if (map.getTerrain()) map.setTerrain({ source: idSourceRelief(prefixe), exaggeration: exageration });
}

export function desactiverRelief(map: maplibregl.Map, prefixe?: string): void {
  const hillshadeId = prefixerId(RELIEF_HILLSHADE_ID, prefixe);
  map.setTerrain(null);
  if (map.getLayer(hillshadeId)) map.setLayoutProperty(hillshadeId, "visibility", "none");
}
`;
  },
]);

await remplacerFichier("apps/map-service/src/app.ts", [
  (contenu) => contenu.replace("relief.getTile(tuile.z, tuile.x, tuile.y, request.raw.signal)", "relief.getTile(tuile.z, tuile.x, tuile.y)"),
]);

async function fichiersRecursifs(dossier) {
  const resultats = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) resultats.push(...await fichiersRecursifs(chemin));
    else if (/\.(svelte|ts|astro)$/.test(entree.name)) resultats.push(chemin);
  }
  return resultats;
}

for (const path of await fichiersRecursifs("apps/web/src")) {
  let contenu = await readFile(path, "utf8");
  const suivant = contenu.replaceAll(
    "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    "/api/v2/map/glyphs/{fontstack}/{range}.pbf",
  );
  if (suivant !== contenu) await writeFile(path, suivant, "utf8");
}

console.log("Migration cliente cartographique appliquée.");
