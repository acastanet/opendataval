import {
  FONDS_CARTOGRAPHIQUES,
  GEOLOGIE,
  IDS_CARTOGRAPHIQUES,
  PALETTE_HYPSOMETRIQUE,
  RELIEF_ATTRIBUTION,
  RELIEF_BOUNDS,
  RELIEF_MAXZOOM,
  prefixerId,
  type FondCartographique,
} from "@opendata-vda/shared/carto";

export type NomStyle = "plan" | "territoire" | "relief" | "hypsometrique";

export interface OptionsStyle {
  prefixe?: string;
  fond: FondCartographique | "nu";
  terrain: boolean;
  exageration: number;
  geologie: boolean;
  relief: boolean;
}

const PREFIXE = /^[a-z][a-z0-9-]{0,20}$/;

export function estNomStyle(value: string): value is NomStyle {
  return ["plan", "territoire", "relief", "hypsometrique"].includes(value);
}

export function lireOptionsStyle(query: Record<string, unknown>): OptionsStyle {
  const prefixe = typeof query.prefixe === "string" && query.prefixe !== "" ? query.prefixe : undefined;
  if (prefixe && !PREFIXE.test(prefixe)) throw new Error("Le préfixe cartographique est invalide.");
  const fond = typeof query.fond === "string" ? query.fond : "plan";
  if (!["plan", "photo", "satellite", "nu"].includes(fond)) throw new Error("Le fond cartographique est invalide.");
  const bool = (value: unknown, fallback: boolean): boolean => value === undefined ? fallback : value === "1" || value === 1 || value === true || value === "true";
  const exageration = query.exageration === undefined ? 1.3 : Number(query.exageration);
  if (!Number.isFinite(exageration) || exageration < 0.5 || exageration > 3) throw new Error("L’exagération du relief doit être comprise entre 0,5 et 3.");
  return {
    prefixe,
    fond: fond as OptionsStyle["fond"],
    terrain: bool(query.terrain, false),
    exageration,
    geologie: bool(query.geologie, false),
    relief: bool(query.relief, false),
  };
}

function id(idBrut: string, prefixe?: string): string {
  return prefixerId(idBrut, prefixe);
}

function sourceFond(fond: (typeof FONDS_CARTOGRAPHIQUES)[number]): Record<string, unknown> {
  return {
    type: "raster",
    tiles: [`/api/v2/map/tiles/${fond.id}/{z}/{x}/{y}.${fond.extension}`],
    tileSize: 256,
    attribution: fond.attribution,
  };
}

function coucheFond(fond: FondCartographique, actif: OptionsStyle["fond"], prefixe?: string): Record<string, unknown> {
  return {
    id: id(IDS_CARTOGRAPHIQUES.couches[fond], prefixe),
    type: "raster",
    source: id(IDS_CARTOGRAPHIQUES.sources[fond], prefixe),
    layout: { visibility: actif === fond ? "visible" : "none" },
  };
}

function expressionHypsometrique(): unknown[] {
  const expression: unknown[] = ["interpolate", ["linear"], ["elevation"]];
  for (const palier of PALETTE_HYPSOMETRIQUE) expression.push(palier.altitude, palier.couleur);
  return expression;
}

export function construireStyle(nom: NomStyle, options: OptionsStyle): Record<string, unknown> {
  const prefixe = options.prefixe;
  const sources: Record<string, unknown> = {};
  const layers: Record<string, unknown>[] = [];
  const inclureTerritoire = nom !== "plan";
  const inclureRelief = nom === "relief" || nom === "hypsometrique" || options.relief;

  for (const fond of FONDS_CARTOGRAPHIQUES) {
    if (nom === "plan" && fond.id !== "plan") continue;
    sources[id(IDS_CARTOGRAPHIQUES.sources[fond.id], prefixe)] = sourceFond(fond);
    layers.push(coucheFond(fond.id, nom === "plan" ? "plan" : options.fond, prefixe));
  }

  if (inclureTerritoire) {
    sources[id(IDS_CARTOGRAPHIQUES.sources.geologie, prefixe)] = {
      type: "raster",
      tiles: ["/api/v2/map/tiles/geologie/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: GEOLOGIE.attribution,
    };
    layers.push({
      id: id(IDS_CARTOGRAPHIQUES.couches.geologie, prefixe),
      type: "raster",
      source: id(IDS_CARTOGRAPHIQUES.sources.geologie, prefixe),
      layout: { visibility: options.geologie ? "visible" : "none" },
      paint: { "raster-opacity": 0.72 },
    });
  }

  if (inclureRelief) {
    sources[id(IDS_CARTOGRAPHIQUES.sources.relief, prefixe)] = {
      type: "raster-dem",
      tiles: ["/api/v2/map/relief/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 512,
      minzoom: 0,
      maxzoom: RELIEF_MAXZOOM,
      bounds: RELIEF_BOUNDS,
      attribution: RELIEF_ATTRIBUTION,
    };

    if (nom === "hypsometrique") {
      layers.unshift({
        id: id(IDS_CARTOGRAPHIQUES.couches.reliefCouleur, prefixe),
        type: "color-relief",
        source: id(IDS_CARTOGRAPHIQUES.sources.relief, prefixe),
        paint: { "color-relief-color": expressionHypsometrique(), "color-relief-opacity": 0.92 },
      });
    }

    layers.push({
      id: id(IDS_CARTOGRAPHIQUES.couches.hillshade, prefixe),
      type: "hillshade",
      source: id(IDS_CARTOGRAPHIQUES.sources.relief, prefixe),
      paint: { "hillshade-exaggeration": 0.3 },
    });
  }

  const style: Record<string, unknown> = {
    version: 8,
    name: `OpenDataVal — ${nom}`,
    glyphs: "/api/v2/map/glyphs/{fontstack}/{range}.pbf",
    sources,
    layers,
  };

  if (inclureRelief && (options.terrain || nom === "relief" || nom === "hypsometrique")) {
    style.terrain = { source: id(IDS_CARTOGRAPHIQUES.sources.relief, prefixe), exaggeration: options.exageration };
  }
  if (nom === "relief") {
    style.sky = { "sky-color": "#dbe8ef", "horizon-color": "#f5f3ec", "fog-color": "#e9eef0" };
  }
  return style;
}
