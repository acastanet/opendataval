import { readFile, writeFile } from "node:fs/promises";

async function transformer(path, transformations) {
  let contenu = await readFile(path, "utf8");
  for (const { label, pattern, replacement } of transformations) {
    const suivant = contenu.replace(pattern, replacement);
    if (suivant === contenu) throw new Error(`${path} : transformation absente — ${label}`);
    contenu = suivant;
  }
  await writeFile(path, contenu, "utf8");
}

await transformer("apps/web/src/islands/FireDashboard.svelte", [
  {
    label: "import urlStyle",
    pattern: 'import { IGN_WMTS, ajouterControleIncendies } from "../lib/carte";',
    replacement: 'import { urlStyle, ajouterControleIncendies } from "../lib/carte";',
  },
  {
    label: "style territoire",
    pattern: 'style: { version: 8, sources: {}, layers: [] },',
    replacement: 'style: urlStyle("territoire", { fond: "plan" }),',
  },
  {
    label: "fonds canoniques",
    pattern: /      map\.addSource\("plan-ign",[\s\S]*?      ajouterControleIncendies\(map, \{ planLayerId: "plan-ign", photoLayerId: "orthophoto-ign",/,
    replacement: '      ajouterControleIncendies(map, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo",',
  },
]);

await transformer("apps/web/src/islands/VigilanceFeu.svelte", [
  {
    label: "import urlStyle",
    pattern: 'import { IGN_WMTS, ajouterControleFondIgn } from "../lib/carte";',
    replacement: 'import { urlStyle, ajouterControleFondIgn } from "../lib/carte";',
  },
  {
    label: "style territoire",
    pattern: 'style: { version: 8, sources: {}, layers: [] },',
    replacement: 'style: urlStyle("territoire", { fond: "plan" }),',
  },
  {
    label: "fonds canoniques",
    pattern: /      map\.addSource\("plan-ign",[\s\S]*?      ajouterControleFondIgn\(map, \{ planLayerId: "plan-ign", photoLayerId: "orthophoto-ign" \}\);/,
    replacement: '      ajouterControleFondIgn(map, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo" });',
  },
]);

await transformer("apps/web/src/islands/FireExpertDashboard.svelte", [
  {
    label: "import urlStyle",
    pattern: 'import { IGN_WMTS, ajouterControleIncendies } from "../lib/carte";',
    replacement: 'import { urlStyle, ajouterControleIncendies } from "../lib/carte";',
  },
  {
    label: "supprime fabrique fonds",
    pattern: /  function ajouterFondsCarte[\s\S]*?\n  \}\n\n  function recentrerCarte/,
    replacement: '  function recentrerCarte',
  },
  {
    label: "style préfixé",
    pattern: 'style: { version: 8, sources: {}, layers: [] },',
    replacement: 'style: urlStyle("territoire", { prefixe: "principal", fond: "plan" }),',
  },
  {
    label: "fonds préfixés canoniques",
    pattern: '      ajouterFondsCarte(map, "principal");\n      ajouterControleIncendies(map, { planLayerId: "principal-plan-ign", photoLayerId: "principal-orthophoto-ign",',
    replacement: '      ajouterControleIncendies(map, { planLayerId: "principal-basemap-plan", photoLayerId: "principal-basemap-photo",',
  },
]);

await transformer("apps/web/src/islands/MeteoPoint.svelte", [
  {
    label: "import urlStyle",
    pattern: 'import { BASEMAPS, ajouterControleFondIgn } from "../lib/carte";',
    replacement: 'import { urlStyle, ajouterControleFondIgn } from "../lib/carte";',
  },
  {
    label: "style radar",
    pattern: /      style: \{\n        version: 8,\n        sources: \{ "ign-plan": \{ type: "raster", tiles: \[BASEMAPS\[0\]\.tiles\], tileSize: 256, attribution: BASEMAPS\[0\]\.attribution \} \},\n        layers: \[\{ id: "ign-plan-layer", type: "raster", source: "ign-plan" \}\],\n      \},/,
    replacement: '      style: urlStyle("plan"),',
  },
  {
    label: "supprime style principal inline",
    pattern: /    const style = \{\n      version: 8,[\s\S]*?\n    \};\n    map = new maplibregl\.Map\(\{/,
    replacement: '    map = new maplibregl.Map({',
  },
  {
    label: "style principal territoire",
    pattern: '      style,\n      bounds: TERRITOIRE.bbox,',
    replacement: '      style: urlStyle("territoire", { fond: "plan" }),\n      bounds: TERRITOIRE.bbox,',
  },
  {
    label: "ids fonds principal",
    pattern: 'ajouterControleFondIgn(map, { planLayerId: "ign-plan-layer", photoLayerId: "ign-photo-layer" });',
    replacement: 'ajouterControleFondIgn(map, { planLayerId: "basemap-plan", photoLayerId: "basemap-photo" });',
  },
]);

await transformer("apps/web/src/islands/Carte3D.svelte", [
  {
    label: "import style relief",
    pattern: 'import { IGN_WMTS, enregistrerProtocolePmtiles, ajouterSourceRelief, RELIEF_SOURCE_ID } from "../lib/carte";',
    replacement: 'import { urlStyle, RELIEF_SOURCE_ID } from "../lib/carte";',
  },
  {
    label: "id hillshade canonique",
    pattern: /hillshade-3d/g,
    replacement: 'relief-hillshade',
  },
  {
    label: "supprime protocole navigateur",
    pattern: /    \/\/ Relief servi depuis les PMTiles locaux[\s\S]*?    enregistrerProtocolePmtiles\(maplibregl\.addProtocol\);\n\n/,
    replacement: '',
  },
  {
    label: "style relief nommé",
    pattern: /      style: \{\n        version: 8,[\s\S]*?\n        sky: \{\},\n      \},/,
    replacement: '      style: urlStyle("relief", { fond: "plan", terrain: true, exageration: 1.8 }),',
  },
  {
    label: "supprime construction relief locale",
    pattern: /      \/\/ Source de relief locale[\s\S]*?      appliquerPresentation\(\);/,
    replacement: '      if (map.getLayer("relief-hillshade")) map.setPaintProperty("relief-hillshade", "hillshade-shadow-color", "#2b4a3f");\n      appliquerPresentation();',
  },
]);

await transformer("apps/web/src/islands/ReliefExplorer.svelte", [
  {
    label: "import style hypsométrique",
    pattern: /  import \{\n    IGN_WMTS,\n    ajouterControleFondIgn,\n    PALETTE_HYPSOMETRIQUE,\n    RELIEF_SOURCE_ID,\n    enregistrerProtocolePmtiles,\n    ajouterSourceRelief,\n    reglerExagerationRelief,\n  \} from "\.\.\/lib\/carte";/,
    replacement: '  import { urlStyle, PALETTE_HYPSOMETRIQUE, RELIEF_SOURCE_ID, reglerExagerationRelief } from "../lib/carte";',
  },
  {
    label: "ids canoniques",
    pattern: '  const COLOR_RELIEF_ID = "relief-hypsometrie";\n  const HILLSHADE_ID = "relief-ombrage";\n  const BASEMAP_ID = "relief-fond-drape";\n  const BASEMAP_SRC = "relief-fond-drape-src";',
    replacement: '  const COLOR_RELIEF_ID = "relief-color";\n  const HILLSHADE_ID = "relief-hillshade";\n  const BASEMAP_PLAN_ID = "basemap-plan";\n  const BASEMAP_PHOTO_ID = "basemap-photo";',
  },
  {
    label: "fonds sans URL locale",
    pattern: /  const FONDS = \[\n    \{ id: "nu", label: "Relief nu", opaciteTeinte: 0\.92 \},\n    \{ id: "photo", label: "Photo aérienne", opaciteTeinte: 0\.3, tiles: IGN_WMTS\([^\n]+\n    \{ id: "plan", label: "Plan IGN", opaciteTeinte: 0\.4, tiles: IGN_WMTS\([^\n]+\n  \];/,
    replacement: '  const FONDS = [\n    { id: "nu", label: "Relief nu", opaciteTeinte: 0.92 },\n    { id: "photo", label: "Photo aérienne", opaciteTeinte: 0.3 },\n    { id: "plan", label: "Plan IGN", opaciteTeinte: 0.4 },\n  ];',
  },
  {
    label: "supprime expression dupliquée",
    pattern: /  \/\*\* Expression `color-relief-color`[\s\S]*?  \];\n\n/,
    replacement: '',
  },
  {
    label: "bascule fonds canoniques",
    pattern: /  function changerFond\(id\) \{[\s\S]*?\n  \}\n\n  onMount/,
    replacement: `  function changerFond(id) {
    fondActif = id;
    if (!map) return;
    if (map.getLayer(BASEMAP_PLAN_ID)) map.setLayoutProperty(BASEMAP_PLAN_ID, "visibility", id === "plan" ? "visible" : "none");
    if (map.getLayer(BASEMAP_PHOTO_ID)) map.setLayoutProperty(BASEMAP_PHOTO_ID, "visibility", id === "photo" ? "visible" : "none");
    const fond = FONDS.find((item) => item.id === id) ?? FONDS[0];
    changerOpaciteTeinte(fond.opaciteTeinte);
  }

  onMount`,
  },
  {
    label: "supprime protocole relief",
    pattern: '    enregistrerProtocolePmtiles(maplibregl.addProtocol);\n\n',
    replacement: '',
  },
  {
    label: "style hypsométrique nommé",
    pattern: /      style: \{\n        version: 8,[\s\S]*?\n      \},\n      center:/,
    replacement: '      style: urlStyle("hypsometrique", { fond: "nu", terrain: true, exageration }),\n      center:',
  },
  {
    label: "supprime couches relief locales",
    pattern: /      ajouterSourceRelief\(map\);[\s\S]*?      map\.setTerrain\(\{ source: RELIEF_SOURCE_ID, exaggeration: exageration \}\);/,
    replacement: `      changerFond(fondActif);
      if (map.getLayer(COLOR_RELIEF_ID)) map.setPaintProperty(COLOR_RELIEF_ID, "color-relief-opacity", opaciteTeinte);
      if (map.getLayer(HILLSHADE_ID)) {
        map.setPaintProperty(HILLSHADE_ID, "hillshade-method", methode);
        map.setPaintProperty(HILLSHADE_ID, "hillshade-exaggeration", intensiteOmbrage);
      }
      reglerExagerationRelief(map, exageration);`,
  },
]);

await transformer("apps/web/src/islands/MapExplorer.svelte", [
  {
    label: "imports styles nommés",
    pattern: /    GEOLOGIE_WMS,\n    ajouterControleFondIgn,[\s\S]*?    reglerExagerationRelief,\n/,
    replacement: '    urlStyle,\n    ajouterControleFondIgn,\n    ajouterCoucheCarte,\n    activerRelief,\n    desactiverRelief,\n    reglerExagerationRelief,\n',
  },
  {
    label: "supprime protocole navigateur",
    pattern: '    enregistrerProtocolePmtiles(maplibregl.addProtocol);\n\n',
    replacement: '',
  },
  {
    label: "style relief central",
    pattern: /      style: \{\n        version: 8,[\s\S]*?\n      \},\n      center:/,
    replacement: '      style: urlStyle("relief", { fond: basemapActif, geologie: estCoucheVisible("geologie"), relief: true, terrain: relief3d, exageration: exagerationRelief }),\n      center:',
  },
  {
    label: "supprime fonds et géologie locaux",
    pattern: /      for \(const b of BASEMAPS\) \{[\s\S]*?      layerIdsParCouche\.geologie = \["geologie-layer"\];/,
    replacement: `      ajouterControleFondIgn(map, {
        planLayerId: "basemap-plan",
        photoLayerId: "basemap-photo",
        autresLayerIds: ["basemap-satellite"],
        actif: basemapActif,
        onChange: (fond) => { changerBasemap(fond); },
      });
      if (map.getLayer("geologie-layer")) {
        map.setPaintProperty("geologie-layer", "raster-opacity", opaciteGeologie);
        map.setLayoutProperty("geologie-layer", "visibility", estCoucheVisible("geologie") ? "visible" : "none");
      }
      layerIdsParCouche.geologie = ["geologie-layer"];`,
  },
  {
    label: "désactive relief initial si nécessaire",
    pattern: '      if (relief3d) activerRelief(map, exagerationRelief);',
    replacement: '      if (relief3d) activerRelief(map, exagerationRelief);\n      else desactiverRelief(map);',
  },
]);

console.log("Migration des îlots vers les styles nommés terminée.");
