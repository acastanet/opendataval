import type {
  DonneeDalleVue,
  ManifesteDalleVue,
  Sphere,
} from "../site-instance.js";

export interface CasApercu {
  id: string;
  libelle: string;
  manifeste: ManifesteDalleVue;
}

const GLB = "/valleraugue-3d/assets/scenes/maison-200m/scene.glb";
const DOSSIER_SCENE = "/valleraugue-3d/assets/scenes/maison-200m/";

function donnee(
  key: string,
  value: unknown,
  producer: string,
  options: Partial<Pick<DonneeDalleVue, "unit" | "distanceM">> = {},
): DonneeDalleVue {
  return {
    key,
    value,
    unit: options.unit ?? null,
    distanceM: options.distanceM ?? null,
    source: { producer, dataset: `apercu/${key}`, url: null, license: "Etalab-2.0" },
    time: {
      observedAt: "2026-08-07T09:55:00.000Z",
      retrievedAt: "2026-08-07T10:00:00.000Z",
      referencePeriod: null,
    },
    status: { availability: "available", freshness: "récent", review: null },
  };
}

const donneesRiches: Record<Sphere, DonneeDalleVue[]> = {
  atmosphere: [
    donnee("temperature_air", 22.7, "Météo-France", { unit: "°C" }),
    donnee("vigilance", "verte", "Météo-France"),
  ],
  hydrosphere: [
    donnee("cours_eau", "Hérault", "Sandre", { distanceM: 84 }),
    donnee("debit", 2.4, "HydroPortail", { unit: "m³/s" }),
  ],
  biosphere: [
    donnee("vegetation", "chênaie mixte", "IGN LiDAR HD"),
    donnee("hauteur_canopee", 14.2, "IGN LiDAR HD", { unit: "m" }),
  ],
  anthroposphere: [
    donnee("commune", "Val-d'Aigoual", "API Découpage administratif"),
    donnee("adresse", "12 rue du Pont, 30570 Val-d'Aigoual", "BAN", { distanceM: 18 }),
  ],
  lithosphere: [
    donnee("altitude", 542.1, "IGN Géoplateforme — RGE ALTI", { unit: "m" }),
    donnee("formation_geologique", "Granite porphyroïde", "BRGM"),
  ],
  risks: [
    donnee("feu_detecte", false, "OpenDataVal — Détection incendie"),
    donnee("alea_feu_foret", "moyen", "DDTM du Gard"),
  ],
};

export function manifesteApercu(
  overrides: Partial<ManifesteDalleVue> = {},
): ManifesteDalleVue {
  return {
    identity: {
      tileId: "ODV-2026-000001",
      title: "Maison de Valleraugue",
      center: { lat: 44.064623, lon: 3.682975 },
      widthM: 200,
      heightM: 200,
      areaM2: 40000,
      geometryWgs84: {
        type: "Polygon",
        coordinates: [[[3.6817, 44.0637], [3.6842, 44.0637], [3.6842, 44.0655], [3.6817, 44.0655], [3.6817, 44.0637]]],
      },
      geometryProjected: {
        type: "Polygon",
        coordinates: [[[754601, 6329635], [754831, 6329635], [754831, 6329865], [754601, 6329865], [754601, 6329635]]],
      },
      address: "12 rue du Pont, 30570 Val-d'Aigoual",
    },
    production: { createdAt: "2026-08-07T10:00:00.000Z", pipelineVersion: "0.1.0-m1" },
    status: "generated",
    scene: {
      glb: GLB,
      terrain: null,
      orthophoto: null,
      metadata: `${DOSSIER_SCENE}scene.json`,
      sourcePoints: {
        glb: `${DOSSIER_SCENE}source-points.glb`,
        metadata: `${DOSSIER_SCENE}source-points.json`,
      },
      orthophotoCalage: { estM: 0, nordM: 0 },
    },
    data: donneesRiches,
    review: { status: "pending", reviewedAt: null, reviewedBy: null, notes: null },
    ...overrides,
  };
}

export const CAS_APERCU: readonly CasApercu[] = [
  { id: "dalle-riche", libelle: "Dalle riche — six sphères et douze données", manifeste: manifesteApercu() },
  { id: "sans-scene", libelle: "Sans scène 3D", manifeste: manifesteApercu({ scene: undefined }) },
  { id: "sans-donnee", libelle: "Sans donnée", manifeste: manifesteApercu({ data: {} }) },
  { id: "fabrication-echouee", libelle: "Fabrication échouée", manifeste: manifesteApercu({ status: "failed", scene: undefined }) },
  { id: "publiee", libelle: "Dalle publiée", manifeste: manifesteApercu({ status: "published", review: { status: "approved", reviewedAt: "2026-08-08T09:00:00.000Z", reviewedBy: "agent-opendata", notes: null } }) },
  { id: "titre-tres-long", libelle: "Titre très long", manifeste: manifesteApercu({ identity: { ...manifesteApercu().identity, title: "Une dalle au titre volontairement très long pour contrôler les retours à la ligne et les petits écrans" } }) },
  { id: "xss", libelle: "Valeurs hostiles (XSS)", manifeste: manifesteApercu({ identity: { ...manifesteApercu().identity, title: "<script>alert(1)</script>" } }) },
] as const;
