import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALTIMETRIE_IGN, bboxAutourPoint, REGIONS_RELIEF, RELIEF_MAXZOOM } from "@opendata-vda/shared/carto";
import { chargerBinaire, urlAltimetrieIgn } from "../src/clients/amonts.js";
import { empriseLambert } from "../src/domain/lambert93.js";
import { tuileTerrarium } from "../src/services/relief-ign.js";

/**
 * Prépare les tuiles terrarium d'une région de relief, à partir du même WMS altimétrique
 * (IGN RGE ALTI) que la route `/api/v2/map/relief-hd`. Étape 1/2 de la fabrication d'une
 * archive comme `aigoual.pmtiles` : ce script produit une arborescence `z/x/y` de PNG ;
 * l'empaquetage en `.pmtiles` (conversion WebP + `pmtiles` CLI) reste une étape séparée,
 * documentée dans doc/microservice/map-service/README.md et doc/ADR/004.
 *
 * Usage :
 *   tsx scripts/generer-region-relief.ts --id alpes-marseille --sortie ../web/public/tuiles-relief
 *   tsx scripts/generer-region-relief.ts --id une-nouvelle-zone --lat 45.75 --lon 4.85 --rayon-km 100 --sortie ...
 *
 * Sans --lat/--lon, la bbox est reprise de REGIONS_RELIEF (packages/shared/src/carto.ts),
 * pour que la zone produite soit toujours celle réellement documentée et servie.
 */

export interface OptionsGeneration {
  id: string;
  bounds: readonly [number, number, number, number];
  zoomMax: number;
  sortie: string;
  wmsUrl: string;
  couche: string;
}

interface EmpriseTuiles { xMin: number; xMax: number; yMin: number; yMax: number }

/** Intervalle de tuiles slippy `{z,x,y}` couvrant une bbox lon/lat, à un zoom donné. */
export function tuilesDansBbox(bounds: readonly [number, number, number, number], zoom: number): EmpriseTuiles {
  const [lonMin, latMin, lonMax, latMax] = bounds;
  const n = 2 ** zoom;
  const tuileX = (lon: number): number => Math.floor(((lon + 180) / 360) * n);
  const tuileY = (lat: number): number => {
    const rad = (Math.max(Math.min(lat, 85.0511), -85.0511) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  };
  return {
    xMin: Math.max(0, tuileX(lonMin)),
    xMax: Math.min(n - 1, tuileX(lonMax)),
    // La latitude décroît quand y croît : le nord (latMax) donne le plus petit y.
    yMin: Math.max(0, tuileY(latMax)),
    yMax: Math.min(n - 1, tuileY(latMin)),
  };
}

/** Nombre total de tuiles à produire, tous zooms de 0 à `zoomMax` inclus. */
export function compterTuiles(bounds: readonly [number, number, number, number], zoomMax: number): number {
  let total = 0;
  for (let z = 0; z <= zoomMax; z++) {
    const { xMin, xMax, yMin, yMax } = tuilesDansBbox(bounds, z);
    total += (xMax - xMin + 1) * (yMax - yMin + 1);
  }
  return total;
}

export function lireOptions(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): OptionsGeneration {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const cle = argv[i];
    const valeur = argv[i + 1];
    if (!cle?.startsWith("--") || valeur === undefined) throw new Error(`Argument invalide : ${cle ?? ""}`);
    args.set(cle.slice(2), valeur);
  }

  const id = args.get("id");
  if (!id) throw new Error("--id est obligatoire (identifie l'archive produite, ex. alpes-marseille).");

  const zoomMax = args.has("zoom-max") ? Number(args.get("zoom-max")) : RELIEF_MAXZOOM;
  if (!Number.isInteger(zoomMax) || zoomMax < 0) throw new Error("--zoom-max doit être un entier positif.");

  const sortie = args.get("sortie");
  if (!sortie) throw new Error("--sortie est obligatoire (dossier où écrire l'arborescence z/x/y).");

  const bounds = args.has("lat") && args.has("lon")
    ? bboxAutourPoint(Number(args.get("lat")), Number(args.get("lon")), args.has("rayon-km") ? Number(args.get("rayon-km")) : 100)
    : REGIONS_RELIEF.find((region) => region.id === id)?.bounds;
  if (!bounds) throw new Error(`Région « ${id} » inconnue de REGIONS_RELIEF : précisez --lat, --lon (et --rayon-km).`);

  return {
    id,
    bounds,
    zoomMax,
    sortie,
    wmsUrl: args.get("wms-url") ?? env.IGN_ALTIMETRIE_WMS_URL ?? "https://data.geopf.fr/wms-r/wms",
    couche: args.get("couche") ?? env.IGN_ALTIMETRIE_LAYER ?? ALTIMETRIE_IGN.couche,
  };
}

async function genererTuile(z: number, x: number, y: number, options: OptionsGeneration): Promise<void> {
  const tuile = { z, x, y };
  const emprise = empriseLambert(tuile);
  const url = urlAltimetrieIgn(options.wmsUrl, options.couche, emprise);
  const reponse = await chargerBinaire(url, 20_000, globalThis.fetch.bind(globalThis));
  const png = tuileTerrarium(reponse.data, emprise, tuile);
  const dossier = join(options.sortie, String(z), String(x));
  await mkdir(dossier, { recursive: true });
  await writeFile(join(dossier, `${y}.png`), png);
}

async function main(): Promise<void> {
  const options = lireOptions(process.argv.slice(2));
  const total = compterTuiles(options.bounds, options.zoomMax);
  console.log(
    `Région « ${options.id} » : ${total} tuiles à produire jusqu'au zoom ${options.zoomMax}, ` +
      `bbox [${options.bounds.map((v) => v.toFixed(4)).join(", ")}].`,
  );
  console.warn(
    "Chaque tuile déclenche un appel au WMS altimétrique IGN : pour une emprise de 100 km de rayon, " +
      "cela représente plusieurs dizaines de milliers de requêtes et peut prendre des heures. " +
      "Interrompre puis relancer ce script réécrit les tuiles déjà produites (aucune reprise incrémentale).",
  );

  let faites = 0;
  for (let z = 0; z <= options.zoomMax; z++) {
    const { xMin, xMax, yMin, yMax } = tuilesDansBbox(options.bounds, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        await genererTuile(z, x, y, options);
        faites += 1;
        if (faites % 500 === 0) console.log(`  ${faites}/${total} tuiles écrites…`);
      }
    }
  }

  console.log(
    [
      "",
      `${total} tuiles PNG terrarium écrites dans ${options.sortie}.`,
      "Reste à empaqueter l'archive PMTiles (hors de ce script, voir doc/ADR/004-choix-maplibre-pmtiles.md) :",
      "  1. Convertir chaque PNG en WebP sans perte (ex. cwebp -lossless).",
      `  2. pmtiles convert ${options.sortie} ${options.id}.pmtiles`,
      `  3. Déposer l'archive dans apps/web/public/relief/ sous ${options.id}.pmtiles / ${options.id}-hd.pmtiles.`,
    ].join("\n"),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
