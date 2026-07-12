import type maplibregl from "maplibre-gl";
import { PMTiles } from "pmtiles";

export const IGN_WMTS = (layer: string, format: string): string =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=${layer}` +
  `&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`;

export const BASEMAPS = [
  { id: "plan", label: "Plan", tiles: IGN_WMTS("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png"), attribution: "© IGN" },
  { id: "photo", label: "Photo aérienne", tiles: IGN_WMTS("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg"), attribution: "© IGN" },
  { id: "satellite", label: "Satellite (SPOT)", tiles: IGN_WMTS("ORTHOIMAGERY.ORTHO-SAT.SPOT.2022", "image/jpeg"), attribution: "© IGN" },
];

export const GEOLOGIE_WMS =
  "https://geoservices.brgm.fr/geologie?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=SCAN_D_GEOL50" +
  "&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true";

export const COULEUR: Record<string, string> = {
  cavite: "#6b4226",
  mouvement: "#b5533c",
  piezo: "#3e6e82",
  station_hydro: "#3e6e82",
  ecole: "#2b3238",
  administration: "#2b3238",
  poi_osm: "#9a9b93",
  adresse: "#3e6e82",
  entreprise: "#6b4226",
  parcelle_agricole: "#5c7a44",
  signe_qualite: "#c99a3e",
  station_meteo: "#3e6e82",
};

export const NOM_COUCHE: Record<string, string> = {
  cavite: "Cavité souterraine",
  mouvement: "Mouvement de terrain",
  piezo: "Piézomètre (nappe)",
  station_hydro: "Station hydrométrique",
  ecole: "École",
  administration: "Service public",
  poi_osm: "Point d'intérêt",
  natura2000: "Site Natura 2000",
  znieff: "ZNIEFF",
  adresse: "Adresse",
  entreprise: "Établissement (SIRENE)",
  parcelle_agricole: "Parcelle agricole (RPG)",
  signe_qualite: "Signe de qualité (AOC/AOP/IGP)",
  station_meteo: "Station météo",
};

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

const RELIEF_PMTILES_URL = "/relief/aigoual.pmtiles";
const RELIEF_HD_PMTILES_URL = "/relief/aigoual-hd.pmtiles";
const RELIEF_GLOBAL_MAXZOOM = 12;
const RELIEF_HD_MINZOOM = 13;
const RELIEF_HD_MAXZOOM = 15;
/** Bbox couverte par les deux extraits pmtiles (cf. commande de régénération dans CLAUDE.md). */
const RELIEF_BOUNDS: [number, number, number, number] = [3.2, 43.8, 4.1, 44.4];
const RELIEF_PROTOCOL = "aigoualdem";
export const RELIEF_SOURCE_ID = "relief-dem-src";
const RELIEF_HILLSHADE_ID = "relief-hillshade";
const RELIEF_ATTRIBUTION = '© <a href="https://mapterhorn.com/attribution">Mapterhorn</a>';

/**
 * Palette hypsométrique calée sur les altitudes du territoire (~150 m dans les vallées cévenoles
 * jusqu'au mont Aigoual, 1567 m). Consommée à la fois pour construire l'expression
 * `color-relief-color` (couche `color-relief` de MapLibre GL ≥ 5.6) et la légende côté île.
 * Chaque palier associe une altitude (m) à une teinte : verts profonds en fond de vallée,
 * verts clairs sur les versants, ocres puis bruns pâles vers les crêtes.
 */
export const PALETTE_HYPSOMETRIQUE: { altitude: number; couleur: string }[] = [
  { altitude: 150, couleur: "#2c5a2c" },
  { altitude: 400, couleur: "#4a7a3a" },
  { altitude: 650, couleur: "#7a9a4a" },
  { altitude: 900, couleur: "#b8a95a" },
  { altitude: 1150, couleur: "#c98f4e" },
  { altitude: 1350, couleur: "#a86b42" },
  { altitude: 1567, couleur: "#d8c4a8" },
];

let protocolePmtilesEnregistre = false;

/**
 * Enregistre le protocole `aigoualdem://{z}/{x}/{y}` auprès de MapLibre (une seule fois par
 * page) : sert l'extrait global (z0-12) sous RELIEF_HD_MINZOOM, l'extrait HD IGN (z13-15,
 * LiDAR HD via Mapterhorn) au-delà, avec repli sur la tuile ancêtre du fond global si la tuile
 * HD est absente (ex. bord de la bbox extraite) pour éviter tout trou de relief.
 * `addProtocol` provient du module `maplibre-gl` importé côté appelant (île client:only).
 */
export function enregistrerProtocolePmtiles(addProtocol: (scheme: string, loader: unknown) => void): void {
  if (protocolePmtilesEnregistre) return;

  const global = new PMTiles(new URL(RELIEF_PMTILES_URL, window.location.origin).href);
  const hd = new PMTiles(new URL(RELIEF_HD_PMTILES_URL, window.location.origin).href);

  addProtocol(RELIEF_PROTOCOL, async (params: { url: string }, abortController: AbortController) => {
    const correspondance = params.url.match(new RegExp(`^${RELIEF_PROTOCOL}://(\\d+)/(\\d+)/(\\d+)$`));
    if (!correspondance) throw new Error(`URL de relief invalide : ${params.url}`);
    const z = Number(correspondance[1]);
    const x = Number(correspondance[2]);
    const y = Number(correspondance[3]);

    if (z >= RELIEF_HD_MINZOOM) {
      try {
        const tuile = await hd.getZxy(z, x, y, abortController.signal);
        if (tuile) return { data: tuile.data };
      } catch {
        /* archive HD indisponible : repli sur le fond global ci-dessous */
      }
      const decalage = z - RELIEF_GLOBAL_MAXZOOM;
      const secours = await global.getZxy(RELIEF_GLOBAL_MAXZOOM, x >> decalage, y >> decalage, abortController.signal);
      if (secours) return { data: secours.data };
      throw new Error(`Aucune donnée de relief pour ${params.url}`);
    }

    const tuile = await global.getZxy(z, x, y, abortController.signal);
    if (!tuile) throw new Error(`Aucune donnée de relief pour ${params.url}`);
    return { data: tuile.data };
  });

  protocolePmtilesEnregistre = true;
}

/**
 * Ajoute (si absente) la source `raster-dem` du relief : DEM terrarium Mapterhorn/LiDAR HD servi
 * via le protocole `aigoualdem://`. Point d'entrée commun à `activerRelief` (terrain 3D + hillshade)
 * et à la page Relief dédiée (couches `color-relief`/`hillshade` sur cette même source).
 */
export function ajouterSourceRelief(map: maplibregl.Map): void {
  if (map.getSource(RELIEF_SOURCE_ID)) return;
  map.addSource(RELIEF_SOURCE_ID, {
    type: "raster-dem",
    tiles: [`${RELIEF_PROTOCOL}://{z}/{x}/{y}`],
    encoding: "terrarium",
    tileSize: 512,
    maxzoom: RELIEF_HD_MAXZOOM,
    bounds: RELIEF_BOUNDS,
    attribution: RELIEF_ATTRIBUTION,
  });
}

/** Active le relief 3D (source raster-dem Mapterhorn + hillshade + terrain MapLibre). */
export function activerRelief(map: maplibregl.Map, exageration: number): void {
  ajouterSourceRelief(map);
  if (!map.getLayer(RELIEF_HILLSHADE_ID)) {
    map.addLayer({
      id: RELIEF_HILLSHADE_ID,
      type: "hillshade",
      source: RELIEF_SOURCE_ID,
      paint: { "hillshade-exaggeration": 0.3 },
    });
  } else {
    map.setLayoutProperty(RELIEF_HILLSHADE_ID, "visibility", "visible");
  }
  map.setTerrain({ source: RELIEF_SOURCE_ID, exaggeration: exageration });
}

/** Ajuste l'exagération verticale du relief déjà activé. */
export function reglerExagerationRelief(map: maplibregl.Map, exageration: number): void {
  if (map.getTerrain()) map.setTerrain({ source: RELIEF_SOURCE_ID, exaggeration: exageration });
}

/** Désactive le relief 3D (repasse la carte à plat). */
export function desactiverRelief(map: maplibregl.Map): void {
  map.setTerrain(null);
  if (map.getLayer(RELIEF_HILLSHADE_ID)) map.setLayoutProperty(RELIEF_HILLSHADE_ID, "visibility", "none");
}
