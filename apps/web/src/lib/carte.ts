import type maplibregl from "maplibre-gl";
import type { CoucheCarte } from "@opendata-vda/shared/catalogue";
import { faBuildingColumns, faCircleDot, faMap, faPlane } from "@fortawesome/free-solid-svg-icons";
import {
  FONDS_CARTOGRAPHIQUES,
  IDS_CARTOGRAPHIQUES,
  PALETTE_HYPSOMETRIQUE as PALETTE_PARTAGEE,
  RELIEF_ATTRIBUTION,
  RELIEF_BOUNDS,
  RELIEF_MAXZOOM,
  RELIEF_TILESIZE,
  TERRAIN_TILESIZE,
  gabaritTuilesRadar as gabaritRadarPartage,
  prefixerId,
  type DefinitionRelief,
  type PrereglageOmbrage,
} from "@opendata-vda/shared/carto";

export const BASE_CARTE = "/api/v2/map";

/** Adaptateur historique : résout un identifiant de couche IGN vers le proxy cartographique local. */
export const IGN_WMTS = (layer: string, format: string): string => {
  const fond = FONDS_CARTOGRAPHIQUES.find((item) => item.coucheIgn === layer && item.format === format);
  if (!fond) throw new Error(`Fond IGN non autorisé : ${layer}`);
  return `${BASE_CARTE}/tiles/${fond.id}/{z}/{x}/{y}.${fond.extension}`;
};
export interface OptionsCarte {
  prefixe?: string;
  fond?: "plan" | "photo" | "satellite" | "nu";
  geologie?: boolean;
  /** Teintes hypsométriques (couche `relief-color`). */
  teintes?: boolean;
  ombrage?: PrereglageOmbrage;
  /** `hd` remplace les archives locales par le RGE ALTI 1 m, plus fin au zoom. */
  altitude?: DefinitionRelief;
  terrain?: boolean;
  exageration?: number;
}

/** URL du style unique servi par map-service. Toutes les couches y sont présentes ; les options ne pilotent que leur visibilité. */
export function urlCarte(options: OptionsCarte = {}): string {
  const params = new URLSearchParams();
  if (options.prefixe) params.set("prefixe", options.prefixe);
  if (options.fond) params.set("fond", options.fond);
  if (options.geologie !== undefined) params.set("geologie", options.geologie ? "1" : "0");
  if (options.teintes !== undefined) params.set("teintes", options.teintes ? "1" : "0");
  if (options.ombrage) params.set("ombrage", options.ombrage);
  if (options.altitude) params.set("altitude", options.altitude);
  if (options.terrain !== undefined) params.set("terrain", options.terrain ? "1" : "0");
  if (options.exageration !== undefined) params.set("exageration", String(options.exageration));
  const query = params.toString();
  return `${BASE_CARTE}/styles/carte.json${query ? `?${query}` : ""}`;
}

export type NomStyle = "plan" | "territoire" | "relief" | "hypsometrique";
export interface OptionsStyle {
  prefixe?: string;
  fond?: "plan" | "photo" | "satellite" | "nu";
  terrain?: boolean;
  exageration?: number;
  geologie?: boolean;
  relief?: boolean;
}

/**
 * @deprecated Les quatre styles nommés ont fusionné en un style unique paramétrable.
 * Cet adaptateur traduit l'ancien nom en options et sera retiré une fois les îlots
 * migrés vers {@link urlCarte}.
 */
export function urlStyle(nom: NomStyle, options: OptionsStyle = {}): string {
  const reliefImpose = nom === "relief" || nom === "hypsometrique";
  return urlCarte({
    prefixe: options.prefixe,
    fond: nom === "plan" ? "plan" : options.fond,
    geologie: nom === "plan" ? false : options.geologie,
    teintes: nom === "hypsometrique",
    // La page relief pilote elle-même la méthode d'ombrage : le préréglage multi lui
    // fournit les quatre teintes sans lesquelles le multidirectionnel n'aurait qu'une source.
    ombrage: nom === "hypsometrique" ? "multi" : reliefImpose || options.relief ? "naturel" : "aucun",
    terrain: reliefImpose ? options.terrain ?? true : options.terrain,
    exageration: options.exageration,
  });
}

export const BASEMAPS = FONDS_CARTOGRAPHIQUES.map((fond) => ({
  id: fond.id,
  label: fond.libelle,
  tiles: `${BASE_CARTE}/tiles/${fond.id}/{z}/{x}/{y}.${fond.extension}`,
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

export const ICONES_REGLEMENTATION = {
  danger: "⚠",
  interdiction: "⛔",
  perimetre: "⌁",
  detection: "●",
} as const;

export interface ControleFondIgnOptions {
  planLayerId?: string;
  photoLayerId?: string;
  autresLayerIds?: string[];
  actif?: "plan" | "photo";
  onChange?: (fond: "plan" | "photo") => void;
}

export interface ControleIncendiesOptions {
  planLayerId: string;
  photoLayerId: string;
  onRecentrer: () => void;
  onLocaliser: () => void;
}

/** Contrôles normalisés des cartes de la mini-app incendies. */
export function ajouterControleIncendies(map: maplibregl.Map, options: ControleIncendiesOptions): void {
  let container: HTMLElement | undefined;
  let fond: "plan" | "photo" = "plan";
  const creerIcone = (definition: typeof faMap): SVGSVGElement => {
    const [largeur, hauteur, , , trace] = definition.icon;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${largeur} ${hauteur}`);
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", Array.isArray(trace) ? trace.join(" ") : trace);
    svg.appendChild(path);
    return svg;
  };
  const appliquerFond = (prochainFond: "plan" | "photo"): void => {
    fond = prochainFond;
    map.setLayoutProperty(options.planLayerId, "visibility", fond === "plan" ? "visible" : "none");
    map.setLayoutProperty(options.photoLayerId, "visibility", fond === "photo" ? "visible" : "none");
    container?.querySelectorAll<HTMLButtonElement>("button[data-fond]").forEach((button) => {
      const actif = button.dataset.fond === fond;
      button.classList.toggle("actif", actif);
      button.setAttribute("aria-pressed", String(actif));
    });
  };
  const control: maplibregl.IControl = {
    onAdd(): HTMLElement {
      container = document.createElement("div");
      container.className = "maplibregl-ctrl opendata-incendies-control";
      container.setAttribute("aria-label", "Commandes de la carte");
      for (const [fondBouton, icone, libelle] of [["plan", faMap, "Afficher le Plan IGN"], ["photo", faPlane, "Afficher la vue aérienne"]] as const) {
        const button = document.createElement("button");
        button.type = "button"; button.dataset.fond = fondBouton; button.dataset.tooltip = libelle; button.appendChild(creerIcone(icone)); button.title = libelle; button.setAttribute("aria-label", libelle); button.setAttribute("aria-pressed", String(fondBouton === fond)); button.classList.toggle("actif", fondBouton === fond);
        button.addEventListener("click", () => appliquerFond(fondBouton));
        container.appendChild(button);
      }
      for (const [icone, libelle, action] of [[faBuildingColumns, "Commune de Val-d’Aigoual", options.onRecentrer], [faCircleDot, "Me localiser", options.onLocaliser]] as const) {
        const button = document.createElement("button");
        button.type = "button"; button.dataset.tooltip = libelle; button.appendChild(creerIcone(icone)); button.title = libelle; button.setAttribute("aria-label", libelle);
        button.addEventListener("click", action);
        container.appendChild(button);
      }
      return container;
    },
    onRemove(): void { container?.remove(); container = undefined; },
  };
  map.addControl(control, "top-right");
}

/** Ajoute le sélecteur compact Plan IGN / photographie aérienne en haut à droite de la carte. */
export function ajouterControleFondIgn(map: maplibregl.Map, options: ControleFondIgnOptions): void {
  let container: HTMLElement | undefined;
  let actif = options.actif ?? "plan";

  const appliquer = (fond: "plan" | "photo"): void => {
    actif = fond;
    const visibles = new Map<string | undefined, boolean>([
      [options.planLayerId, fond === "plan"],
      [options.photoLayerId, fond === "photo"],
    ]);
    for (const layerId of options.autresLayerIds ?? []) visibles.set(layerId, false);
    for (const [layerId, visible] of visibles) {
      if (layerId && map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
    options.onChange?.(fond);
    container?.querySelectorAll("button").forEach((button) => {
      const selectionne = button.dataset.fond === actif;
      button.classList.toggle("actif", selectionne);
      button.setAttribute("aria-pressed", String(selectionne));
    });
  };

  const control: maplibregl.IControl = {
    onAdd(): HTMLElement {
      container = document.createElement("div");
      container.className = "maplibregl-ctrl opendata-fonds-control";
      container.setAttribute("aria-label", "Fond de carte");
      for (const [fond, icone, libelle] of [["plan", "▤", "Plan IGN"], ["photo", "◒", "Vue aérienne"]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.fond = fond;
        button.className = fond === actif ? "actif" : "";
        button.textContent = icone;
        button.title = libelle;
        button.dataset.tooltip = libelle;
        button.setAttribute("aria-label", `Afficher ${libelle}`);
        button.setAttribute("aria-pressed", String(fond === actif));
        button.addEventListener("click", () => appliquer(fond));
        container.appendChild(button);
      }
      return container;
    },
    onRemove(): void { container?.remove(); container = undefined; },
  };
  map.addControl(control, "top-right");
}

export const GEOLOGIE_WMS = `${BASE_CARTE}/tiles/geologie/{z}/{x}/{y}.png`;

/**
 * Ajoute une source GeoJSON clusterisée (clusters + halo + points individuels) et retourne
 * les identifiants des layers créés, pour intégration dans layerIdsParCouche.
 */
export function ajouterCoucheClusterisee(
  map: maplibregl.Map,
  slug: string,
  geojson: GeoJSON.FeatureCollection,
  couleur: string,
  visible: boolean,
): string[] {
  const sourceId = `${slug}-src`;
  const clustersId = `${slug}-clusters`;
  const countId = `${slug}-cluster-count`;
  const pointId = `${slug}-point`;
  const visibility = visible ? "visible" : "none";

  map.addSource(sourceId, {
    type: "geojson",
    data: geojson,
    cluster: true,
    clusterMaxZoom: 15,
    clusterRadius: 45,
  });

  map.addLayer({
    id: clustersId,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": couleur,
      "circle-opacity": 0.75,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ededea",
      "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24],
    },
    layout: { visibility },
  });

  map.addLayer({
    id: countId,
    type: "symbol",
    source: sourceId,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      visibility,
    },
    paint: { "text-color": "#ededea" },
  });

  map.addLayer({
    id: pointId,
    type: "circle",
    source: sourceId,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 4.5,
      "circle-color": couleur,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "#ededea",
    },
    layout: { visibility },
  });

  map.on("click", clustersId, (e) => {
    const feature = map.queryRenderedFeatures(e.point, { layers: [clustersId] })[0];
    const clusterId = feature?.properties?.cluster_id;
    if (clusterId === undefined) return;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err || !feature || feature.geometry.type !== "Point") return;
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
    });
  });
  map.on("mouseenter", clustersId, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", clustersId, () => (map.getCanvas().style.cursor = ""));
  map.on("mouseenter", pointId, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", pointId, () => (map.getCanvas().style.cursor = ""));

  return [clustersId, countId, pointId];
}

/**
 * Fabrique unique d'une couche de données, entièrement pilotée par le descripteur `CoucheCarte`.
 * Remplace les créations ad hoc de MapExplorer et CarteThematique : délègue au rendu clusterisé
 * si `couche.cluster`, sinon crée les layers point (`<slug>-layer`) ou polygone
 * (`<slug>-fill` + `<slug>-line`, pointillés si `couche.tirets`) selon `couche.geometrie`.
 * `onClic(feature, lngLat)` est câblé sur le layer cliquable. Retourne les IDs de layers créés
 * (pour alimenter le panneau de couches). Les polygones étant insérés avant les points par
 * l'appelant, ils restent visuellement sous les marqueurs.
 */
export function ajouterCoucheCarte(
  map: maplibregl.Map,
  couche: CoucheCarte,
  geojson: GeoJSON.FeatureCollection,
  visible: boolean,
  onClic: (feature: maplibregl.MapGeoJSONFeature, lngLat: maplibregl.LngLat) => void,
): string[] {
  const slug = couche.slug;
  const sourceId = `${slug}-src`;
  const visibility = visible ? "visible" : "none";

  const clic = (layerId: string): void => {
    map.on("click", layerId, (e) => {
      const f = e.features?.[0];
      if (f) onClic(f, e.lngLat);
    });
    map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
  };

  if (couche.cluster && couche.geometrie === "point") {
    const ids = ajouterCoucheClusterisee(map, slug, geojson, couche.couleur, visible);
    // ajouterCoucheClusterisee câble déjà les survols ; il reste le clic sur les points individuels.
    map.on("click", `${slug}-point`, (e) => {
      const f = e.features?.[0];
      if (f) onClic(f, e.lngLat);
    });
    return ids;
  }

  if (couche.geometrie === "polygone") {
    const fillId = `${slug}-fill`;
    const lineId = `${slug}-line`;
    map.addSource(sourceId, { type: "geojson", data: geojson });
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: { "fill-color": couche.couleur, "fill-opacity": 0.28 },
      layout: { visibility },
    });
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": couche.couleur,
        "line-width": 1.4,
        ...(couche.tirets ? { "line-dasharray": [2, 2] } : {}),
      },
      layout: { visibility },
    });
    clic(fillId);
    return [fillId, lineId];
  }

  const layerId = `${slug}-layer`;
  map.addSource(sourceId, { type: "geojson", data: geojson });
  map.addLayer({
    id: layerId,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-radius": 5.5,
      "circle-color": couche.couleur,
      "circle-stroke-width": 1.3,
      "circle-stroke-color": "#ededea",
    },
    layout: { visibility },
  });
  clic(layerId);
  return [layerId];
}

export const RELIEF_PROTOCOL = "aigoualdem";
export const RELIEF_SOURCE_ID = IDS_CARTOGRAPHIQUES.sources.relief;
export const RELIEF_TERRAIN_SOURCE_ID = IDS_CARTOGRAPHIQUES.sources.terrain;
const RELIEF_HILLSHADE_ID = IDS_CARTOGRAPHIQUES.couches.hillshade;
export const PALETTE_HYPSOMETRIQUE = PALETTE_PARTAGEE.map(({ altitude, couleur }) => ({ altitude, couleur }));

/** Compatibilité temporaire : les îlots peuvent conserver cet appel, aucun protocole custom n'est enregistré. */
export function enregistrerProtocolePmtiles(_addProtocol: (scheme: string, loader: unknown) => void): void {}

/** Identifiant de la source d'altitude réservée au terrain 3D. */
export function idSourceTerrain(prefixe?: string): string {
  return prefixerId(RELIEF_TERRAIN_SOURCE_ID, prefixe);
}

function descripteurRelief(tailleTuile: number) {
  return {
    type: "raster-dem" as const,
    tiles: [BASE_CARTE + "/relief/{z}/{x}/{y}.webp"],
    encoding: "terrarium" as const,
    tileSize: tailleTuile,
    maxzoom: RELIEF_MAXZOOM,
    bounds: [...RELIEF_BOUNDS] as number[],
    attribution: RELIEF_ATTRIBUTION,
  };
}

/**
 * Ajoute les deux sources d'altitude si le style servi ne les porte pas déjà : l'une pour
 * l'ombrage, l'autre pour le terrain. Les garder séparées évite que le terrain fasse
 * chuter d'un cran le zoom des tuiles sur lesquelles l'ombrage est calculé.
 */
export function ajouterSourceRelief(map: maplibregl.Map, prefixe?: string): void {
  const sourceId = idSourceRelief(prefixe);
  if (!map.getSource(sourceId)) map.addSource(sourceId, descripteurRelief(RELIEF_TILESIZE));
  const terrainId = idSourceTerrain(prefixe);
  if (!map.getSource(terrainId)) map.addSource(terrainId, descripteurRelief(TERRAIN_TILESIZE));
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
  map.setTerrain({ source: idSourceTerrain(prefixe), exaggeration: exageration });
}

export function reglerExagerationRelief(map: maplibregl.Map, exageration: number, prefixe?: string): void {
  if (map.getTerrain()) map.setTerrain({ source: idSourceTerrain(prefixe), exaggeration: exageration });
}

export function desactiverRelief(map: maplibregl.Map, prefixe?: string): void {
  const hillshadeId = prefixerId(RELIEF_HILLSHADE_ID, prefixe);
  map.setTerrain(null);
  if (map.getLayer(hillshadeId)) map.setLayoutProperty(hillshadeId, "visibility", "none");
}
