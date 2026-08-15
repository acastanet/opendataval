import { readFileSync } from "node:fs";
import { escapeAttr, escapeHtml, renderPage } from "./layout.js";
import type { GatewayConfig } from "./../config.js";

/**
 * Page de consultation d'une dalle OpenDataVdA. Le manifeste reste embarqué dans le HTML :
 * aucune route JSON publique n'est ajoutée (ADR-008). Le moteur et sa feuille de style sont
 * servis séparément sous `/api/v2/sites/viewer/` pour garder une boucle de design directe.
 */

export type EtatDalle = "created" | "collecting" | "generated" | "review_required" | "approved" | "published" | "failed";
export type StatutRevue = "not_started" | "pending" | "approved" | "changes_requested";
export type Sphere = "atmosphere" | "hydrosphere" | "biosphere" | "anthroposphere" | "lithosphere" | "risks";
export type Disponibilite = "available" | "not_found" | "not_applicable" | "source_unavailable" | "error";

export interface PolygoneDalleVue {
  type: "Polygon";
  coordinates: number[][][];
}

export interface DonneeDalleVue {
  key: string;
  value: unknown;
  unit: string | null;
  distanceM: number | null;
  source: { producer: string; dataset: string; url: string | null; license: string | null };
  time: { observedAt: string | null; retrievedAt: string; referencePeriod: string | null };
  status: { availability: Disponibilite; freshness: string | null; review: string | null };
}

export interface ManifesteDalleVue {
  identity: {
    tileId: string;
    title: string | null;
    center: { lat: number; lon: number };
    widthM: number;
    heightM: number;
    areaM2: number;
    geometryWgs84?: PolygoneDalleVue;
    geometryProjected?: PolygoneDalleVue;
    address: string | null;
  };
  production: { createdAt: string; pipelineVersion: string };
  status: EtatDalle;
  scene?: {
    glb: string | null;
    terrain: string | null;
    orthophoto: string | null;
    metadata?: string | null;
    sourcePoints?: { glb: string; metadata: string | null } | null;
    orthophotoCalage?: { estM: number; nordM: number } | null;
    geology?: { texture: string; pick: string; metadata: string } | null;
    terrainBbox?: [number, number, number, number] | null;
    orthophotoSizePx?: number | null;
    orthophotoResolutionM?: number | null;
  };
  data: Partial<Record<Sphere, DonneeDalleVue[]>>;
  review: { status: StatutRevue; reviewedAt: string | null; reviewedBy: string | null; notes: string | null };
}

export const SPHERES: ReadonlyArray<{ id: Sphere; label: string; couleur: string }> = [
  { id: "atmosphere", label: "Atmosphère", couleur: "#0B6F8B" },
  { id: "hydrosphere", label: "Hydrosphère", couleur: "#1769AA" },
  { id: "biosphere", label: "Biosphère", couleur: "#52663A" },
  { id: "anthroposphere", label: "Anthroposphère", couleur: "#345E70" },
  { id: "lithosphere", label: "Lithosphère", couleur: "#6B4226" },
  { id: "risks", label: "Risques", couleur: "#B94A1E" },
];

const VIEWER_TEMPLATE = readFileSync(
  new URL("./dalle/viewer-template.html", import.meta.url),
  "utf8",
);

/** Empêche une valeur `</script>` de fermer le bloc JSON embarqué. */
export function manifesteEmbarque(manifeste: ManifesteDalleVue): string {
  const json = JSON.stringify(manifeste).replace(/</g, "\\u003c");
  return `<script type="application/json" id="manifeste-dalle">${json}</script>`;
}

function preparerGabarit(
  manifeste: ManifesteDalleVue,
  options: { apercu?: boolean } = {},
): string {
  const titre = manifeste.identity.title ?? `Dalle ${manifeste.identity.tileId}`;
  const sousTitre = [
    manifeste.identity.address,
    `${manifeste.identity.widthM} × ${manifeste.identity.heightM} m`,
  ].filter(Boolean).join(" · ");
  const bandeau = options.apercu
    ? `<div class="preview-banner" role="note">Aperçu fictif — données de démonstration</div>`
    : "";
  const identiteAccessible = `Identifiant ${manifeste.identity.tileId} · Centre ${manifeste.identity.center.lat.toFixed(6)}, ${manifeste.identity.center.lon.toFixed(6)}`;

  return VIEWER_TEMPLATE
    .replace("<title>Maquette du village</title>", `<title>${escapeHtml(titre)} — OpenDataVal</title>`)
    .replace('./styles.css?v=20260802-calage-ortho', '/api/v2/sites/viewer/styles.css?v=20260808-p9')
    .replace('"three": "./vendor/three.module.js"', '"three": "/api/v2/sites/viewer/vendor/three.module.js"')
    .replace('"three/addons/": "./vendor/addons/"', '"three/addons/": "/api/v2/sites/viewer/vendor/addons/"')
    .replace('<body>', `<body data-tile-id="${escapeAttr(manifeste.identity.tileId)}">${bandeau}`)
    .replace('<span class="brand__eyebrow" id="sceneSubtitle">IGN LiDAR HD</span>', `<span class="brand__eyebrow" id="sceneSubtitle">${escapeHtml(sousTitre)}</span>`)
    .replace('<h1 id="sceneTitle">Maquette du village</h1>', `<h1 id="sceneTitle">${escapeHtml(titre)}</h1>`)
    .replace("</header>", `<p class="visually-hidden">${escapeHtml(identiteAccessible)}</p></header>`)
    .replace('<script type="module" src="./app.js?v=20260802-calage-ortho"></script>', `${manifesteEmbarque(manifeste)}\n    <script type="module" src="/api/v2/sites/viewer/viewer.js?v=20260808-p9"></script>`);
}

export function renderSiteInstance(
  _config: GatewayConfig,
  manifeste: ManifesteDalleVue,
  options: { apercu?: boolean } = {},
): string {
  return preparerGabarit(manifeste, options);
}

export function renderApercuIndex(config: GatewayConfig, cas: ReadonlyArray<{ id: string; libelle: string }>): string {
  const items = cas.map(({ id, libelle }) =>
    `<li><a href="/api/v2/sites/apercu/${escapeAttr(id)}">${escapeHtml(libelle)}</a></li>`,
  ).join("\n");
  const body = `<h2>Aperçus de la page dalle</h2>
<p class="lead">États fictifs destinés au design et aux tests. La scène 3D du cas riche est réelle.</p>
<ul class="sources-list">${items}</ul>`;
  return renderPage({ title: "Aperçus de la page dalle — OpenDataVal", version: config.version, body });
}

export function renderSiteInstanceIntrouvable(config: GatewayConfig, tileId: string): string {
  const body = `<h2>Dalle introuvable</h2>
<p class="lead">Aucune instance ne correspond à l'identifiant <span class="route">${escapeHtml(tileId)}</span>.</p>`;
  return renderPage({ title: "Dalle introuvable — OpenDataVal", version: config.version, body });
}

export function renderSiteInstanceIndisponible(config: GatewayConfig): string {
  const body = `<h2>Service temporairement indisponible</h2>
<p class="lead">Impossible de récupérer cette dalle pour le moment. Réessayez dans un instant.</p>`;
  return renderPage({ title: "Dalle indisponible — OpenDataVal", version: config.version, body });
}
