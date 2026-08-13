import {
  ALTIMETRIE_IGN,
  CIEL_TERRAIN,
  FONDS_CARTOGRAPHIQUES,
  GEOLOGIE,
  IDS_CARTOGRAPHIQUES,
  PALETTE_HYPSOMETRIQUE,
  PREREGLAGES_OMBRAGE,
  RELIEF_ATTRIBUTION,
  RELIEF_BOUNDS,
  RELIEF_MAXZOOM,
  RELIEF_TILESIZE,
  TERRAIN_TILESIZE,
  estPrereglageOmbrage,
  prefixerId,
  reglageOmbrage,
  type DefinitionRelief,
  type FondCartographique,
  type PrereglageOmbrage,
} from "@opendata-vda/shared/carto";

/**
 * Le service ne sert qu'un style : toutes les couches y sont toujours présentes, et
 * les options ne pilotent que leur visibilité et leur peinture. Les identifiants
 * canoniques restent donc stables d'une requête à l'autre, ce qui permet aux clients
 * de basculer un fond ou une opacité sans recharger le style.
 */
export const NOM_STYLE = "carte";

/** Styles nommés servis avant la fusion, conservés pour l'erreur de migration. */
export const ANCIENS_STYLES = ["plan", "territoire", "relief", "hypsometrique"] as const;

export interface OptionsStyle {
  prefixe?: string;
  fond: FondCartographique | "nu";
  /**
   * Fond uni sous les couches raster. Sans lui, un fond "nu" (ou tout gabarit de tuile
   * manquant) laisse voir la transparence du canevas, ce qui se traduit en 3D par des
   * bords de dalles de relief qui semblent plonger à la verticale au-delà de RELIEF_BOUNDS.
   */
  fondOpaque: boolean;
  geologie: boolean;
  teintes: boolean;
  ombrage: PrereglageOmbrage;
  terrain: boolean;
  exageration: number;
  altitude: DefinitionRelief;
}

const PREFIXE = /^[a-z][a-z0-9-]{0,20}$/;

export function lireOptionsStyle(query: Record<string, unknown>): OptionsStyle {
  const prefixe = typeof query.prefixe === "string" && query.prefixe !== "" ? query.prefixe : undefined;
  if (prefixe && !PREFIXE.test(prefixe)) throw new Error("Le préfixe cartographique est invalide.");
  const fond = typeof query.fond === "string" ? query.fond : "plan";
  if (!["plan", "photo", "satellite", "nu"].includes(fond)) throw new Error("Le fond cartographique est invalide.");
  const ombrage = typeof query.ombrage === "string" && query.ombrage !== "" ? query.ombrage : "naturel";
  if (!estPrereglageOmbrage(ombrage)) {
    throw new Error(`L’ombrage doit être l’un de : ${PREREGLAGES_OMBRAGE.map((reglage) => reglage.id).join(", ")}.`);
  }
  const altitude = typeof query.altitude === "string" && query.altitude !== "" ? query.altitude : "standard";
  if (altitude !== "standard" && altitude !== "hd") throw new Error("La définition du relief doit être « standard » ou « hd ».");
  const bool = (value: unknown, fallback: boolean): boolean => value === undefined ? fallback : value === "1" || value === 1 || value === true || value === "true";
  const exageration = query.exageration === undefined ? 1.3 : Number(query.exageration);
  if (!Number.isFinite(exageration) || exageration < 0.5 || exageration > 3) throw new Error("L’exagération du relief doit être comprise entre 0,5 et 3.");
  return {
    prefixe,
    fond: fond as OptionsStyle["fond"],
    fondOpaque: bool(query.fondOpaque, true),
    geologie: bool(query.geologie, false),
    teintes: bool(query.teintes, false),
    ombrage,
    terrain: bool(query.terrain, false),
    exageration,
    altitude,
  };
}

function id(idBrut: string, prefixe?: string): string {
  return prefixerId(idBrut, prefixe);
}

function visibilite(actif: boolean): { visibility: "visible" | "none" } {
  return { visibility: actif ? "visible" : "none" };
}

function sourceFond(fond: (typeof FONDS_CARTOGRAPHIQUES)[number]): Record<string, unknown> {
  return {
    type: "raster",
    tiles: [`/api/v2/map/tiles/${fond.id}/{z}/{x}/{y}.${fond.extension}`],
    tileSize: 256,
    // Sans plafond, MapLibre réclame des tuiles jusqu'à z22 : l'amont expire et la carte
    // remonte une erreur, là où un simple agrandissement suffirait.
    maxzoom: fond.zoomMax,
    attribution: fond.attribution,
  };
}

function coucheFond(fond: FondCartographique, actif: OptionsStyle["fond"], prefixe?: string): Record<string, unknown> {
  return {
    id: id(IDS_CARTOGRAPHIQUES.couches[fond], prefixe),
    type: "raster",
    source: id(IDS_CARTOGRAPHIQUES.sources[fond], prefixe),
    layout: visibilite(actif === fond),
  };
}

function expressionHypsometrique(): unknown[] {
  const expression: unknown[] = ["interpolate", ["linear"], ["elevation"]];
  for (const palier of PALETTE_HYPSOMETRIQUE) expression.push(palier.altitude, palier.couleur);
  return expression;
}

export function construireStyle(options: OptionsStyle): Record<string, unknown> {
  const prefixe = options.prefixe;
  const sources: Record<string, unknown> = {};
  const layers: Record<string, unknown>[] = [];
  const ombrage = reglageOmbrage(options.ombrage);

  layers.push({
    id: id("fond-uni", prefixe),
    type: "background",
    layout: visibilite(options.fondOpaque),
    paint: { "background-color": CIEL_TERRAIN["fog-color"] },
  });

  for (const fond of FONDS_CARTOGRAPHIQUES) {
    sources[id(IDS_CARTOGRAPHIQUES.sources[fond.id], prefixe)] = sourceFond(fond);
    layers.push(coucheFond(fond.id, options.fond, prefixe));
  }

  sources[id(IDS_CARTOGRAPHIQUES.sources.geologie, prefixe)] = {
    type: "raster",
    tiles: ["/api/v2/map/tiles/geologie/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: GEOLOGIE.zoomMax,
    attribution: GEOLOGIE.attribution,
  };
  layers.push({
    id: id(IDS_CARTOGRAPHIQUES.couches.geologie, prefixe),
    type: "raster",
    source: id(IDS_CARTOGRAPHIQUES.sources.geologie, prefixe),
    layout: visibilite(options.geologie),
    paint: { "raster-opacity": 1 },
  });

  // Modèle d'altitude. En « standard », les archives PMTiles locales — des WebP sans
  // perte, d'où l'extension du gabarit — jusqu'à z15. En « hd », le même gabarit sert les
  // archives jusqu'à z15 puis le RGE ALTI converti à la demande en z16, le seul niveau où il
  // porte du détail que les archives n'ont plus sans dépasser son propre pas métrique. La
  // source reste donc déclarée depuis z0 : la pyramide est complète dans les deux cas.
  //
  // La même donnée est déclarée deux fois : brancher une source sur `terrain` fait chuter
  // d'un cran le zoom de ses tuiles, et une couche d'ombrage qui la partagerait se
  // calculerait sur un relief deux fois moins résolu. Les deux sources sont toujours
  // présentes, même sans terrain : les voir apparaître et disparaître fait échouer le
  // diff de style de MapLibre, qui reconstruit alors tout le style à chaque changement.
  const hd = options.altitude === "hd";
  const sourceRelief = (tailleTuile: number): Record<string, unknown> => ({
    type: "raster-dem",
    tiles: [hd ? "/api/v2/map/relief-hd/{z}/{x}/{y}.png" : "/api/v2/map/relief/{z}/{x}/{y}.webp"],
    encoding: "terrarium",
    tileSize: tailleTuile,
    minzoom: 0,
    maxzoom: hd ? ALTIMETRIE_IGN.zoomMax : RELIEF_MAXZOOM,
    bounds: RELIEF_BOUNDS,
    attribution: hd ? ALTIMETRIE_IGN.attribution : RELIEF_ATTRIBUTION,
  });
  sources[id(IDS_CARTOGRAPHIQUES.sources.relief, prefixe)] = sourceRelief(RELIEF_TILESIZE);
  sources[id(IDS_CARTOGRAPHIQUES.sources.terrain, prefixe)] = sourceRelief(TERRAIN_TILESIZE);

  // Le fond drapé reste sous la teinte, puis l'ombrage vient révéler la microtopographie.
  layers.push({
    id: id(IDS_CARTOGRAPHIQUES.couches.reliefCouleur, prefixe),
    type: "color-relief",
    source: id(IDS_CARTOGRAPHIQUES.sources.relief, prefixe),
    layout: visibilite(options.teintes),
    paint: { "color-relief-color": expressionHypsometrique(), "color-relief-opacity": 0.92 },
  });

  layers.push({
    id: id(IDS_CARTOGRAPHIQUES.couches.hillshade, prefixe),
    type: "hillshade",
    source: id(IDS_CARTOGRAPHIQUES.sources.relief, prefixe),
    layout: visibilite(ombrage.peinture !== undefined),
    // « Aucun » masque la couche : sa peinture reste celle du préréglage naturel afin
    // qu'un client puisse la rendre visible sans avoir à la repeindre.
    paint: { ...(ombrage.peinture ?? reglageOmbrage("naturel").peinture) },
  });

  const style: Record<string, unknown> = {
    version: 8,
    name: `OpenDataVal — ${NOM_STYLE}`,
    glyphs: "/api/v2/map/glyphs/{fontstack}/{range}.pbf",
    sources,
    layers,
  };

  if (options.terrain) {
    style.terrain = { source: id(IDS_CARTOGRAPHIQUES.sources.terrain, prefixe), exaggeration: options.exageration };
    style.sky = { ...CIEL_TERRAIN };
  }
  return style;
}
