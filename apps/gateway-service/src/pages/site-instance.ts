import { escapeAttr, escapeHtml, renderPage } from "./layout.js";
import type { GatewayConfig } from "./../config.js";

/**
 * Page de consultation d'une dalle OpenDataVdA, servie à `GET /api/v2/sites/:tileId`
 * (ADR-008, `agent/mvp/09-DECISIONS.md`). Le gateway récupère le manifeste côté serveur
 * depuis la route interne de `site-service` (`GET /internal/v1/sites/:tileId`, jamais
 * exposée directement) et rend une page HTML complète : aucune donnée métier ne transite
 * par une route JSON publique pour cette consultation.
 *
 * Les types ci-dessous sont une copie locale et volontairement minimale du contrat de
 * `packages/shared/src/dalle.ts` : le gateway n'embarque pas `@opendata-vda/shared` (même
 * convention que `PREREGLAGES_OMBRAGE` recopié dans `pages/demo.ts`). L'API interne de
 * `site-service` répond en camelCase (forme native `ManifesteDalle`), distincte du
 * `manifest.json` sur disque qui suit le schéma snake_case — voir l'en-tête de `dalle.ts`.
 */

export type EtatDalle = "created" | "collecting" | "generated" | "review_required" | "approved" | "published" | "failed";
export type StatutRevue = "not_started" | "pending" | "approved" | "changes_requested";
export type Sphere = "atmosphere" | "hydrosphere" | "biosphere" | "anthroposphere" | "lithosphere" | "risks";
export type Disponibilite = "available" | "not_found" | "not_applicable" | "source_unavailable" | "error";

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
    address: string | null;
  };
  production: { createdAt: string; pipelineVersion: string };
  status: EtatDalle;
  scene?: { glb: string | null; terrain: string | null; orthophoto: string | null };
  data: Partial<Record<Sphere, DonneeDalleVue[]>>;
  review: { status: StatutRevue; reviewedAt: string | null; reviewedBy: string | null; notes: string | null };
}

/** Six sphères produit (`agent/mvp/00-PRODUCT.md`), avec le libellé et la teinte de puce affichés. */
const SPHERES: ReadonlyArray<{ id: Sphere; label: string; couleur: string }> = [
  { id: "atmosphere", label: "Atmosphère", couleur: "#168AAD" },
  { id: "hydrosphere", label: "Hydrosphère", couleur: "#1C7ED6" },
  { id: "biosphere", label: "Biosphère", couleur: "#7A8B5E" },
  { id: "anthroposphere", label: "Anthroposphère", couleur: "#3E6E82" },
  { id: "lithosphere", label: "Lithosphère", couleur: "#6B4226" },
  { id: "risks", label: "Risques", couleur: "#D96832" },
];

const TONE_ETAT: Record<EtatDalle, string | null> = {
  created: null,
  collecting: "yellow",
  generated: "yellow",
  review_required: "orange",
  approved: "green",
  published: "green",
  failed: "red",
};
const LABEL_ETAT: Record<EtatDalle, string> = {
  created: "créée",
  collecting: "en collecte",
  generated: "générée",
  review_required: "en revue",
  approved: "approuvée",
  published: "publiée",
  failed: "échec de fabrication",
};

const TONE_REVUE: Record<StatutRevue, string | null> = {
  not_started: null,
  pending: "yellow",
  approved: "green",
  changes_requested: "orange",
};
const LABEL_REVUE: Record<StatutRevue, string> = {
  not_started: "revue non commencée",
  pending: "revue en attente",
  approved: "revue approuvée",
  changes_requested: "corrections demandées",
};

const TONE_DISPONIBILITE: Record<Disponibilite, string | null> = {
  available: "green",
  not_found: null,
  not_applicable: null,
  source_unavailable: "orange",
  error: "red",
};
const LABEL_DISPONIBILITE: Record<Disponibilite, string> = {
  available: "disponible",
  not_found: "non trouvée",
  not_applicable: "non applicable",
  source_unavailable: "source indisponible",
  error: "erreur",
};

/** `model-viewer` (Google), seule dépendance externe de cette page — SRI vérifiée à la main. */
const MODEL_VIEWER_HEAD = `<script type="module" src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js" integrity="sha384-Ftcjj/GNLxPvzNDftO/oryXB9aGxsGZY9JGqsXG0uUKgQDl9RfDgsx9NJ/4IVNPe" crossorigin="anonymous"></script>`;

function badge(label: string, tone: string | null): string {
  const attr = tone ? ` data-level="${escapeAttr(tone)}"` : "";
  return `<span class="badge"${attr}>${escapeHtml(label)}</span>`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "inconnue";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatValeur(value: unknown, unit: string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const texte = typeof value === "object" ? JSON.stringify(value) : String(value);
  return unit ? `${texte} ${unit}` : texte;
}

function renderDonnee(d: DonneeDalleVue): string {
  const distance = d.distanceM !== null ? ` · à ${Math.round(d.distanceM)} m` : "";
  return `<li class="donnee-item">
  <div class="ligne">
    <span class="cle">${escapeHtml(d.key)}</span>
    ${badge(LABEL_DISPONIBILITE[d.status.availability], TONE_DISPONIBILITE[d.status.availability])}
  </div>
  <div class="valeur">${escapeHtml(formatValeur(d.value, d.unit))}</div>
  <div class="provenance">Source : ${escapeHtml(d.source.producer)}${distance} · récupéré le ${escapeHtml(formatDate(d.time.retrievedAt))}</div>
</li>`;
}

function renderSphereBlock(sphere: (typeof SPHERES)[number], donnees: DonneeDalleVue[] | undefined): string {
  if (!donnees || donnees.length === 0) return "";
  return `<div class="sphere-block">
  <h3><span class="sphere-dot" style="background:${sphere.couleur}"></span>${escapeHtml(sphere.label)}</h3>
  <ul class="donnee-list">
${donnees.map(renderDonnee).join("\n")}
  </ul>
</div>`;
}

/** Résumé des provenances distinctes, en plus du détail déjà porté par chaque donnée. */
function renderSources(manifeste: ManifesteDalleVue): string {
  const vues = new Map<string, DonneeDalleVue["source"]>();
  for (const donnees of Object.values(manifeste.data)) {
    for (const d of donnees ?? []) {
      const cle = `${d.source.producer}::${d.source.dataset}`;
      if (!vues.has(cle)) vues.set(cle, d.source);
    }
  }
  if (vues.size === 0) return "";
  const items = [...vues.values()]
    .map((s) => {
      const lien = s.url ? ` — <a href="${escapeAttr(s.url)}">${escapeHtml(s.url)}</a>` : "";
      const licence = s.license ? ` · licence ${escapeHtml(s.license)}` : "";
      return `<li><strong>${escapeHtml(s.producer)}</strong> · ${escapeHtml(s.dataset)}${licence}${lien}</li>`;
    })
    .join("\n");
  return `<h2>Provenance</h2>
<ul class="sources-list">
${items}
</ul>`;
}

function renderScene(scene: ManifesteDalleVue["scene"]): string {
  if (!scene?.glb) {
    return `<p class="lead">Aucune scène 3D rattachée pour l'instant.</p>`;
  }
  return `<model-viewer class="scene-3d" src="${escapeAttr(scene.glb)}" camera-controls auto-rotate shadow-intensity="1" alt="Scène 3D de la dalle"></model-viewer>
<p class="hint">Scène provisoire (lot P4) : elle ne décrit pas nécessairement les coordonnées exactes de cette dalle — voir <span class="route">agent/mvp/01-ARCHITECTURE.md</span> § « Pipeline 3D ».</p>`;
}

export function renderSiteInstance(config: GatewayConfig, manifeste: ManifesteDalleVue): string {
  const titre = manifeste.identity.title ?? `Dalle ${manifeste.identity.tileId}`;

  const identityBlock = `<p class="lead">Identifiant <span class="route">${escapeHtml(manifeste.identity.tileId)}</span>${manifeste.identity.address ? ` · ${escapeHtml(manifeste.identity.address)}` : ""}</p>
<div class="summary">
  <div class="kv"><span class="k">Centre</span><span class="v">${manifeste.identity.center.lat.toFixed(6)}, ${manifeste.identity.center.lon.toFixed(6)}</span></div>
  <div class="kv"><span class="k">Emprise</span><span class="v">${manifeste.identity.widthM} × ${manifeste.identity.heightM} m</span></div>
  <div class="kv"><span class="k">Surface</span><span class="v">${manifeste.identity.areaM2.toLocaleString("fr-FR")} m²</span></div>
  <div class="kv"><span class="k">Créée le</span><span class="v">${escapeHtml(formatDate(manifeste.production.createdAt))}</span></div>
  <div class="kv"><span class="k">Fabrication</span><span class="v">${badge(LABEL_ETAT[manifeste.status], TONE_ETAT[manifeste.status])}</span></div>
  <div class="kv"><span class="k">Revue</span><span class="v">${badge(LABEL_REVUE[manifeste.review.status], TONE_REVUE[manifeste.review.status])}</span></div>
</div>`;

  const auMoinsUneDonnee = Object.values(manifeste.data).some((donnees) => (donnees?.length ?? 0) > 0);
  const sphereBlocks = SPHERES.map((sphere) => renderSphereBlock(sphere, manifeste.data[sphere.id])).join("\n");

  const body = `<h2>${escapeHtml(titre)}</h2>
${identityBlock}
<h2>Scène 3D</h2>
${renderScene(manifeste.scene)}
<h2>Informations locales</h2>
${auMoinsUneDonnee ? sphereBlocks : `<p class="lead">Aucune donnée collectée pour l'instant.</p>`}
${renderSources(manifeste)}`;

  return renderPage({ title: `${titre} — OpenDataVal`, version: config.version, body, head: MODEL_VIEWER_HEAD });
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
