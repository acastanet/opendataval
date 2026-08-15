import { COUCHES } from "./catalogue.js";

export type FondCartographique = "plan" | "photo" | "satellite";
export type NiveauVigilanceFeu = "blanc" | "jaune" | "orange" | "rouge" | "inconnu";

export interface DescripteurFond {
  id: FondCartographique;
  libelle: string;
  coucheIgn: string;
  format: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
  attribution: string;
  /**
   * Dernier niveau réellement couvert par l'amont, mesuré sur le service. Sans lui,
   * MapLibre réclame des tuiles jusqu'à z22 : l'IGN expire ou renvoie du vide, et la
   * carte remonte une erreur de chargement au lieu de sur-échantillonner.
   */
  zoomMax: number;
}

export const FONDS_CARTOGRAPHIQUES: readonly DescripteurFond[] = [
  { id: "plan", libelle: "Plan IGN", coucheIgn: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", format: "image/png", extension: "png", attribution: "© IGN", zoomMax: 19 },
  { id: "photo", libelle: "Photographie aérienne", coucheIgn: "ORTHOIMAGERY.ORTHOPHOTOS", format: "image/jpeg", extension: "jpg", attribution: "© IGN", zoomMax: 19 },
  { id: "satellite", libelle: "Satellite SPOT", coucheIgn: "ORTHOIMAGERY.ORTHO-SAT.SPOT.2022", format: "image/jpeg", extension: "jpg", attribution: "© IGN", zoomMax: 17 },
] as const;

/** Le SCAN géologique est levé au 1/50 000 : au-delà, l'agrandissement n'apporte rien. */
export const GEOLOGIE = { id: "geologie", libelle: "Carte géologique", couche: "SCAN_D_GEOL50", attribution: "© BRGM", zoomMax: 16 } as const;

/** Degrés de latitude par kilomètre, à la précision suffisante pour délimiter une région de relief. */
const KM_PAR_DEGRE_LATITUDE = 111.32;

/**
 * Bbox `[lonMin, latMin, lonMax, latMax]` carrée, centrée sur un point WGS84, dont chaque
 * côté est à `rayonKm` du centre. Le pas en longitude se resserre avec la latitude
 * (`cos(latitude)`) pour que le carré reste approximativement isométrique au sol : sans
 * cette correction, une même distance en longitude couvrirait plus de terrain vers le nord.
 *
 * Réutilisée à la fois pour définir `REGIONS_RELIEF` et par le script de génération des
 * archives PMTiles, pour que la zone documentée soit toujours celle réellement produite.
 */
export function bboxAutourPoint(lat: number, lon: number, rayonKm: number): readonly [number, number, number, number] {
  const deltaLat = rayonKm / KM_PAR_DEGRE_LATITUDE;
  const deltaLon = rayonKm / (KM_PAR_DEGRE_LATITUDE * Math.cos((lat * Math.PI) / 180));
  return [lon - deltaLon, lat - deltaLat, lon + deltaLon, lat + deltaLat];
}

export interface RegionRelief {
  id: string;
  libelle: string;
  /** `[lonMin, latMin, lonMax, latMax]` */
  bounds: readonly [number, number, number, number];
}

/**
 * Régions couvertes par des archives PMTiles de relief. Chaque région a ses deux archives
 * propres (`<id>.pmtiles` et `<id>-hd.pmtiles`) ; `ReliefPmtiles` choisit l'archive à
 * interroger selon la région dont `bounds` contient la tuile demandée.
 */
export const REGIONS_RELIEF: readonly RegionRelief[] = [
  { id: "aigoual", libelle: "Cévennes / Mont Aigoual", bounds: [3.2, 43.8, 4.1, 44.4] },
  { id: "alpes-marseille", libelle: "Alpes / Marseille (100 km)", bounds: bboxAutourPoint(43.2965, 5.3698, 100) },
  { id: "perigueux", libelle: "Périgueux (100 km)", bounds: bboxAutourPoint(45.1848, 0.7211, 100) },
] as const;

/**
 * Bbox englobante de toutes les régions de relief, utilisée comme `bounds` de la source
 * MapLibre `raster-dem` : elle couvre aussi des zones sans archive (hors des régions
 * individuelles), qui restent tolérées en 404 comme le reste de la couverture manquante.
 */
export const RELIEF_BOUNDS_GLOBAL: readonly [number, number, number, number] = REGIONS_RELIEF.reduce(
  ([lonMin, latMin, lonMax, latMax], region) => [
    Math.min(lonMin, region.bounds[0]),
    Math.min(latMin, region.bounds[1]),
    Math.max(lonMax, region.bounds[2]),
    Math.max(latMax, region.bounds[3]),
  ],
  [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
);

export const RELIEF_HD_MINZOOM = 13;
export const RELIEF_MAXZOOM = 15;
export const RELIEF_ATTRIBUTION = '© <a href="https://mapterhorn.com/attribution">Mapterhorn</a>';

/**
 * Définition du modèle d'altitude.
 *
 * `standard` sert les archives PMTiles embarquées : robustes, disponibles hors ligne,
 * mais arrêtées à `RELIEF_MAXZOOM` (~1,7 m/px) — au-delà, MapLibre ne fait qu'interpoler.
 * `hd` convertit à la demande le RGE ALTI 1 m de la Géoplateforme, ce qui redonne du
 * détail réel au niveau 16, au prix d'une dépendance à l'IGN en temps réel.
 */
export type DefinitionRelief = "standard" | "hd";

export const ALTIMETRIE_IGN = {
  /**
   * Couche altimétrique — le choix décide de la résolution réelle, et **le nom ne l'annonce
   * pas**.
   *
   * `ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES`, malgré son nom, est servie depuis une pyramide
   * plafonnée à 4,78 m/px en Web Mercator. Demandée plus fine, la Géoplateforme l'interpole,
   * dans n'importe quel système : les tuiles portent alors un réseau régulier de période fixe
   * au sol, `4,777 × cos(latitude)` ≈ 3,45 m, que l'ombrage — qui dérive la pente — souligne
   * en un quadrillage de traits noirs. Mesuré sur les tuiles produites, le pic spectral à cette
   * période valait 19 à 82 fois le fond, partout sur le territoire.
   *
   * `RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS` est la pyramide native : elle duplique franchement
   * les colonnes si on demande plus fin que 1 m, et ne porte plus aucun réseau à 1 m pile.
   *
   * Contrepartie : c'est un nom de pyramide interne, moins stable qu'un identifiant
   * `ELEVATION.*`, et limité à la France métropolitaine en Lambert-93. D'où `IGN_ALTIMETRIE_LAYER`,
   * qui permet d'en changer sans reconstruire l'image.
   */
  couche: "RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS",
  /** BIL 32 bits : le WMS renvoie les altitudes en float32 little-endian, sans en-tête. */
  format: "image/x-bil;bits=32",
  /**
   * Système de la requête altimétrique — **jamais** le Web Mercator des tuiles.
   *
   * La couche n'existe qu'en Lambert-93 ; et même là où les deux systèmes sont disponibles, la
   * pyramide EPSG:3857 sur-échantillonne au plus proche voisin, jusqu'à trois colonnes sur
   * quatre recopiées sur une tuile z16. La reprojection vers la grille des tuiles nous revient
   * donc, en bilinéaire.
   */
  crs: "EPSG:2154",
  /** Pas natif de la grille RGE ALTI, en mètres Lambert. Ne jamais demander plus fin. */
  resolutionM: 1,
  /** Valeur renvoyée hors couverture, à ne surtout pas encoder telle quelle. */
  nodata: -99999,
  /** Côté de la tuile terrarium produite. */
  taille: 512,
  /**
   * Premier niveau où l'IGN apporte du détail que les archives PMTiles n'ont plus, celles-ci
   * s'arrêtant à `RELIEF_MAXZOOM`. En dessous, la route sert l'archive locale : elle est
   * aussi fine, disponible hors ligne, et couvre toute la pyramide — sans quoi MapLibre
   * réclamerait des tuiles que le service devrait refuser.
   */
  zoomMin: RELIEF_MAXZOOM + 1,
  /**
   * Dernier niveau servi, et il n'y en a qu'un.
   *
   * Une tuile z16 de 512 px vaut 0,86 m/px : déjà plus fin que la source. Un niveau de plus
   * n'apporterait aucune donnée, seulement une interpolation 2,33× — et c'est exactement là que
   * le réseau de la grille métrique redevenait visible (pic à 2,33 px, jusqu'à 30 fois le fond,
   * là où z16 reste au niveau du fond naturel). Au-delà, MapLibre agrandit la tuile z16, ce que
   * notre interpolation ferait de toute façon, mais sans figer le motif dans la donnée.
   */
  zoomMax: RELIEF_MAXZOOM + 1,
  attribution: "© IGN — RGE ALTI",
} as const;

/**
 * Teintes hypsométriques du territoire. Le palier le plus bas fixe le plancher de
 * l'expression `["interpolate", …, ["elevation"], …]` : tout ce qui est en dessous
 * reçoit la même couleur, d'où un plancher calé sur les fonds de vallée (~100 m) et
 * non sur la première courbe de niveau du massif.
 */
export const PALETTE_HYPSOMETRIQUE = [
  { altitude: 100, couleur: "#23482a", libelle: "100 m" },
  { altitude: 150, couleur: "#2c5a2c", libelle: "150 m" },
  { altitude: 400, couleur: "#4a7a3a", libelle: "400 m" },
  { altitude: 650, couleur: "#7a9a4a", libelle: "650 m" },
  { altitude: 900, couleur: "#b8a95a", libelle: "900 m" },
  { altitude: 1150, couleur: "#c98f4e", libelle: "1 150 m" },
  { altitude: 1350, couleur: "#a86b42", libelle: "1 350 m" },
  { altitude: 1470, couleur: "#bf9068", libelle: "1 470 m" },
  { altitude: 1567, couleur: "#d8c4a8", libelle: "1 567 m" },
] as const;

export type PrereglageOmbrage = "aucun" | "doux" | "naturel" | "sculpte" | "multi";

export interface ReglageOmbrage {
  id: PrereglageOmbrage;
  libelle: string;
  /** Ce que le préréglage cherche à obtenir, affiché tel quel dans les interfaces. */
  intention: string;
  /** Peinture MapLibre de la couche hillshade ; absente lorsque la couche est masquée. */
  peinture?: Readonly<Record<string, unknown>>;
}

/**
 * Préréglages d'ombrage du relief. Chacun encapsule un algorithme MapLibre (≥ 5.5) et
 * ses réglages d'éclairage, pour qu'un appelant choisisse une intention plutôt que des
 * radians. Trois invariants tirés du shader `hillshade.fragment.glsl` :
 *
 * - `hillshade-illumination-anchor: "map"` — sans lui, l'azimut se voit ajouter le cap
 *   de la caméra et l'ombrage tourne avec la vue, ce qui ruine la lecture du relief en 3D ;
 * - `hillshade-accent-color` n'est lu que par la méthode `standard`, et `illumination-altitude`
 *   ignoré par `standard` et `igor` : ces propriétés ne sont donc posées que là où elles agissent ;
 * - le nombre de sources lumineuses compilé dans le shader vaut exactement la longueur de
 *   `hillshade-highlight-color` : `multi` doit fournir autant de teintes que d'azimuts.
 */
export const PREREGLAGES_OMBRAGE: readonly ReglageOmbrage[] = [
  {
    id: "aucun",
    libelle: "Aucun",
    intention: "Fond nu, sans ombrage du relief.",
  },
  {
    id: "doux",
    libelle: "Doux",
    intention: "Modelé discret qui n’assombrit pas le fond : à privilégier sous la photographie aérienne et le plan IGN.",
    peinture: {
      "hillshade-method": "igor",
      "hillshade-exaggeration": 0.45,
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-anchor": "map",
      "hillshade-shadow-color": "#46525c",
      "hillshade-highlight-color": "rgba(255, 250, 240, 0.35)",
      resampling: "linear",
    },
  },
  {
    id: "naturel",
    libelle: "Naturel",
    intention: "Éclairage lambertien classique, du nord-ouest à 45° : lecture physique du terrain.",
    peinture: {
      "hillshade-method": "basic",
      "hillshade-exaggeration": 0.5,
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-altitude": 45,
      "hillshade-illumination-anchor": "map",
      "hillshade-shadow-color": "#3d4a54",
      "hillshade-highlight-color": "#fff6e3",
      resampling: "linear",
    },
  },
  {
    id: "sculpte",
    libelle: "Sculpté",
    intention: "Intensité liée à la pente : crêtes, ravins et gorges ressortent nettement.",
    peinture: {
      "hillshade-method": "combined",
      "hillshade-exaggeration": 0.6,
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-altitude": 40,
      "hillshade-illumination-anchor": "map",
      "hillshade-shadow-color": "#33404a",
      "hillshade-highlight-color": "#fffaf0",
      resampling: "linear",
    },
  },
  {
    id: "multi",
    libelle: "Multi-directions",
    intention: "Quatre sources lumineuses : aucun versant ne reste dans une ombre plate, au prix d’un rendu plus lisse.",
    peinture: {
      "hillshade-method": "multidirectional",
      "hillshade-exaggeration": 0.55,
      "hillshade-illumination-direction": [225, 270, 315, 360],
      "hillshade-illumination-altitude": [55, 45, 45, 35],
      "hillshade-illumination-anchor": "map",
      "hillshade-shadow-color": ["#3f4c56", "#3a4750", "#36434c", "#404d57"],
      "hillshade-highlight-color": ["#fff6e3", "#fff8ea", "#fffaf0", "#fff4dd"],
      resampling: "linear",
    },
  },
] as const;

export function estPrereglageOmbrage(value: string): value is PrereglageOmbrage {
  return PREREGLAGES_OMBRAGE.some((prereglage) => prereglage.id === value);
}

export function reglageOmbrage(id: PrereglageOmbrage): ReglageOmbrage {
  const trouve = PREREGLAGES_OMBRAGE.find((prereglage) => prereglage.id === id);
  if (!trouve) throw new Error(`Préréglage d’ombrage inconnu : ${id}`);
  return trouve;
}

/** Ciel et brume appliqués dès que le terrain 3D est actif. */
export const CIEL_TERRAIN = {
  "sky-color": "#a8c8e8",
  "horizon-color": "#e8eef2",
  "fog-color": "#dfe6e6",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.55,
  "fog-ground-blend": 0.35,
  "atmosphere-blend": 0.7,
} as const;

export const VIGILANCE_FEU = {
  blanc: { libelle: "Blanc", acces: "Accès autorisé", couleurPastille: "#ffffff", couleurCarte: "#ffffff", opacite: 0, largeurContour: 3 },
  jaune: { libelle: "Jaune", acces: "Accès autorisé", couleurPastille: "#ffff80", couleurCarte: "#ffff00", opacite: 0.5, largeurContour: 2 },
  orange: { libelle: "Orange", acces: "Accès déconseillé", couleurPastille: "#ff854a", couleurCarte: "#ffa500", opacite: 0.7, largeurContour: 2 },
  rouge: { libelle: "Rouge", acces: "Accès interdit", couleurPastille: "#ff3e3e", couleurCarte: "#ff0000", opacite: 0.7, largeurContour: 2 },
  inconnu: { libelle: "Non publié", acces: "Consultez la carte officielle", couleurPastille: "#808285", couleurCarte: "#808285", opacite: 0.35, largeurContour: 2 },
} as const satisfies Record<NiveauVigilanceFeu, {
  libelle: string;
  acces: string;
  couleurPastille: string;
  couleurCarte: string;
  opacite: number;
  largeurContour: number;
}>;

export const VIGILANCE_FEU_CONTOUR = "#000000";
export const VIGILANCE_FEU_TEXTE = "#1a1a1a";

export interface RepresentationCouche {
  slug: string;
  libelle: string;
  libellePluriel: string;
  geometrie: "point" | "polygone";
  couleur: string;
  cluster: boolean;
  tirets: boolean;
}

export const REPRESENTATIONS_COUCHES = Object.fromEntries(
  COUCHES.map((couche) => [
    couche.slug,
    {
      slug: couche.slug,
      libelle: couche.libelle,
      libellePluriel: couche.libellePluriel,
      geometrie: couche.geometrie,
      couleur: couche.couleur,
      cluster: "cluster" in couche && couche.cluster === true,
      tirets: "tirets" in couche && couche.tirets === true,
    } satisfies RepresentationCouche,
  ]),
) as Record<string, RepresentationCouche>;

export const IDS_CARTOGRAPHIQUES = {
  sources: {
    plan: "fond-plan-src",
    photo: "fond-photo-src",
    satellite: "fond-satellite-src",
    geologie: "geologie-src",
    relief: "relief-dem-src",
    terrain: "relief-terrain-src",
  },
  couches: { plan: "basemap-plan", photo: "basemap-photo", satellite: "basemap-satellite", geologie: "geologie-layer", hillshade: "relief-hillshade", reliefCouleur: "relief-color" },
} as const;

/**
 * Le modèle d'altitude est déclaré **deux fois**, sur les mêmes tuiles : une source pour
 * l'ombrage et les teintes, une autre pour le terrain 3D.
 *
 * MapLibre dégrade en effet toute source raster-dem branchée sur `terrain` : son
 * gestionnaire de tuiles passe en `usedForTerrain`, sa taille de tuile est multipliée par
 * deux (`TerrainTileManager`, `deltaZoom = 1`, « raster-dem tiles will load for performance
 * the actualZoom - deltaZoom zoom-level ») et le niveau demandé descend donc d'un cran.
 * Une couche d'ombrage partageant cette source hérite de la perte et se calcule sur un
 * relief deux fois moins résolu. Deux sources distinctes, chacune avec sa propre grille,
 * suppriment ce couplage — c'est le motif retenu par les exemples MapLibre et Mapterhorn.
 */
export const RELIEF_TILESIZE = 512;

/**
 * Taille annoncée pour la source de terrain. Le `TerrainTileManager` la double : la
 * déclarer à 256 ramène la grille du terrain au zoom affiché au lieu du zoom - 1, ce qui
 * double la finesse du maillage 3D. Les tuiles restent physiquement en 512 px — cette
 * valeur ne pilote que le niveau de zoom demandé, jamais le décodage, qui lit les
 * dimensions réelles de l'image. Contrepartie : environ quatre fois plus de tuiles
 * d'altitude chargées en vue 3D ; repasser à 512 restaure le comportement économe.
 */
export const TERRAIN_TILESIZE = 256;

export function prefixerId(id: string, prefixe?: string): string {
  return prefixe ? `${prefixe}-${id}` : id;
}

export function cheminFrameValide(path: string): boolean {
  return /^\/v2\/radar\/(nowcast\/)?[0-9a-f]+$/.test(path);
}

export function urlTuileRadarAmont(path: string, z: number, x: number, y: number): string {
  return `https://tilecache.rainviewer.com${path}/256/${z}/${x}/${y}/2/1_1.png`;
}

export function gabaritTuilesRadar(path: string): string {
  return `/api/v2/map/tiles/radar/{z}/{x}/{y}.png?path=${encodeURIComponent(path)}`;
}
